import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { usePrefs } from '../../lib/prefs'
import { Select } from '../../motion/Select'
import { useDash } from '../context'
import { byDay, Columns, Donut, Gauge, Heat, histogram, PALETTE, weekHours } from '../viz'
import { Card, EASE, Empty, Gate, Kpis, Loading, Note, PageHead, Prob, q, RefreshButton, Split, useFetch } from '../ui'

type Decision = { id: number; call_id: string; ts: number; purpose: string; engine: string; model_id: string; provider: string; question_id: string; question_type: string; answer: string; probabilities: string; confidence: number | null; action: string; latency_ms: number; input_tokens: number; cached: number }

const BAR_COLORS = ['var(--violet)', 'var(--orange)', 'var(--green)', 'var(--blue)', 'var(--yellow)', 'var(--lime)']

export default function Decisions() {
  const { repo } = useDash()
  const prefs = usePrefs()
  const [limit, setLimit] = useState(80)
  const [filter, setFilter] = useState('')
  const [purpose, setPurpose] = useState('all')
  const [engine, setEngine] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const { data, error, loading, reloading, reload } = useFetch<Decision[]>(repo ? `/api/decisions?limit=${limit}&${q(repo)}` : null)
  const all = data ?? []
  const rows = all.filter((d) => (purpose === 'all' || d.purpose === purpose) && (engine === 'all' || d.engine === engine) && (!filter || `${d.purpose} ${d.question_id} ${d.answer} ${d.action}`.toLowerCase().includes(filter.toLowerCase())))
  const purposes = useMemo(() => {
    const m = new Map<string, number>()
    all.forEach((d) => m.set(d.purpose, (m.get(d.purpose) ?? 0) + 1))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all])
  const engines = [...new Set(all.map((d) => d.engine))]
  const withConf = rows.filter((d) => d.confidence != null)
  const meanConf = withConf.length ? withConf.reduce((a, d) => a + (d.confidence ?? 0), 0) / withConf.length : 0
  const fresh = rows.filter((d) => !d.cached)
  const meanLat = fresh.length ? fresh.reduce((a, d) => a + d.latency_ms, 0) / fresh.length : 0
  const when = (ts: number) => new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: prefs.timeFormat === '12h' })

  const days = useMemo(() => byDay(rows.map((d) => d.ts), 14), [rows])
  const week = useMemo(() => weekHours(rows.map((d) => d.ts)), [rows])
  const confHist = useMemo(() => histogram(withConf.map((d) => d.confidence ?? 0), 10, 'var(--orange)'), [withConf])
  const cacheRate = rows.length ? (rows.length - fresh.length) / rows.length : 0

  const aside = purposes.length > 0 && (
    <>
      <Card title="By purpose" delay={0.1} aside={purpose !== 'all' ? <button className="d-chip" onClick={() => setPurpose('all')}>Show all</button> : undefined}>
        <Donut data={purposes.map(([p, n], i) => ({ label: p, value: n, color: BAR_COLORS[i % BAR_COLORS.length] ?? PALETTE[i] }))} label="decisions" picked={purpose === 'all' ? undefined : purpose} onPick={(sl) => setPurpose(purpose === sl.label ? 'all' : sl.label)} size={150} />
      </Card>
      <Card title="Cache" delay={0.15}>
        <div className="d-gauges">
          <Gauge p={cacheRate} color="var(--green)" label="answered from cache" sub={`${rows.length - fresh.length} of ${rows.length}`} />
          <Gauge p={meanConf} color="var(--orange)" label="mean confidence" sub={`${withConf.length} with a confidence`} delay={0.15} />
        </div>
      </Card>
    </>
  )

  return (
    <div className="d-body">
      <PageHead theme="lilac" kicker="Audit log" title="Every" oblique="decision" note="Each judgement Jev made: its probabilities, what code did with it, and whether it came from the cache." actions={<RefreshButton busy={reloading} onClick={reload} />} />
      <Gate />
      {error && <Note tone="error">{error}</Note>}
      {loading && !data && <Loading label="Opening the log book" />}
      {data && (
        <>
          <Kpis
            items={[
              { label: 'Decisions shown', value: rows.length, hint: `of the latest ${all.length}`, color: 'var(--violet)' },
              { label: 'From cache', value: rows.length ? `${Math.round(((rows.length - fresh.length) / rows.length) * 100)}%` : '—', color: 'var(--green)' },
              { label: 'Mean confidence', value: withConf.length ? meanConf.toFixed(2) : '—', color: 'var(--orange)' },
              { label: 'Fresh latency', value: fresh.length ? `${(meanLat / 1000).toFixed(1)}s` : '—', hint: 'mean, uncached', color: 'var(--blue)' },
            ]}
          />
          {rows.length > 0 && (
            <div className="d-bento">
              <Card span={8} title="When Jev decided" delay={0.05} aside={<span className="d-muted">last 14 days</span>}>
                <Columns data={days.map((d) => ({ ...d, hint: `decisions on ${d.label}` }))} color="var(--violet)" h={150} ticks={7} />
              </Card>
              <Card span={4} title="How sure" delay={0.1} aside={<span className="d-muted">confidence spread</span>}>
                <Columns data={confHist} h={150} ticks={5} />
              </Card>
              <Card span={12} title="Rhythm" delay={0.15} aside={<span className="d-muted">weekday × hour</span>}>
                <Heat grid={week.grid} rows={week.rows} cols={week.cols} unit="decisions" />
              </Card>
            </div>
          )}
          <Split aside={aside || undefined}>
            <div className="d-toolbar">
              <input className="field d-toolbar__search" placeholder="Filter by question, answer or action" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter decisions" />
              <Select label="Purpose" value={purpose} onChange={setPurpose} options={[{ value: 'all', label: 'Every purpose' }, ...purposes.map(([p, n]) => ({ value: p, label: p, hint: `${n} decisions` }))]} />
              <Select label="Engine" value={engine} onChange={setEngine} align="end" options={[{ value: 'all', label: 'Every engine' }, ...engines.map((e) => ({ value: e, label: e }))]} />
            </div>
            {rows.length === 0 ? (
              <Card><Empty title={all.length ? 'Nothing matches' : 'No decisions yet'}>{all.length ? 'Try a different filter.' : 'Ask a question or plan a tour and every judgement lands here.'}</Empty></Card>
            ) : (
              <Card>
                <div className="dx">
                  {rows.map((d) => {
                    let probs: Record<string, number> = {}
                    try { probs = JSON.parse(d.probabilities) } catch { /* not JSON */ }
                    const isOpen = open === d.id
                    return (
                      <div key={d.id} className={`dx-row ${isOpen ? 'is-open' : ''}`}>
                        <button className="dx-head" onClick={() => setOpen(isOpen ? null : d.id)} aria-expanded={isOpen} data-cursor={isOpen ? 'Collapse' : 'Show probabilities'}>
                          <span className="dx-stub">
                            {d.confidence != null ? <Prob p={d.confidence} size={40} /> : <span className="dx-none">—</span>}
                          </span>
                          <span className="dx-body">
                            <span className="dx-line">
                              <b className="dx-answer">{d.answer}</b>
                              <span className="d-tag">{d.purpose}</span>
                              {!!d.cached && <span className="d-tag is-ok">cached</span>}
                            </span>
                            <span className="dx-q mono">{d.question_id}</span>
                            {d.action && <span className="dx-act d-clamp">{d.action}</span>}
                          </span>
                          <span className="dx-meta">
                            <span>{when(d.ts)}</span>
                            <span className="mono">{d.engine}</span>
                          </span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ ease: EASE, duration: 0.3 }} style={{ overflow: 'hidden' }}>
                              <div className="dx-more">
                                <div className="small d-muted">{d.question_type} · {d.model_id} via {d.provider} · {Math.round(d.latency_ms)} ms · {d.input_tokens} input tokens · call <span className="mono">{d.call_id.slice(0, 12)}</span></div>
                                <div className="d-probs">{Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => <span key={k}><Prob p={v} size={30} /><span className="mono small">{k}</span></span>)}</div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
                {all.length >= limit && <div className="d-card__foot"><button className="d-chip" onClick={() => setLimit(limit + 120)}>Load 120 more</button></div>}
              </Card>
            )}
          </Split>
        </>
      )}
    </div>
  )
}
