import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Select } from '../../motion/Select'
import { useDash } from '../context'
import { Columns, Donut, histogram, PALETTE, Radar, Scatter } from '../viz'
import { Card, EASE, Empty, Gate, Kpis, Loading, Note, PageHead, Prob, q, RefreshButton, Split, useFetch } from '../ui'

type Pick = { number: number; title: string; url: string; labels: string[]; score: number; parts: Record<string, number>; kind: string; engine: string }
type IssuesData = { weights: Record<string, number>; picks: Pick[]; open_unlinked: number; annotated: number }
const PART_LABEL: Record<string, string> = { scope_clarity: 'clear scope', prior_knowledge_needed: 'little prior knowledge', has_acceptance_criteria: 'says when it is done', touches_single_area: 'one area of code' }

export default function Issues() {
  const { repo } = useDash()
  const navigate = useNavigate()
  const { data, error, loading, reloading, reload } = useFetch<IssuesData>(repo ? `/api/issues?${q(repo)}` : null)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('score')
  const [kind, setKind] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const kinds = useMemo(() => [...new Set((data?.picks ?? []).map((p) => p.kind))], [data])
  const picks = useMemo(() => {
    const rows = (data?.picks ?? []).filter((p) => (kind === 'all' || p.kind === kind) && (!filter || `#${p.number} ${p.title} ${p.labels.join(' ')}`.toLowerCase().includes(filter.toLowerCase())))
    return [...rows].sort((a, b) => (sort === 'score' ? b.score - a.score : sort === 'newest' ? b.number - a.number : a.number - b.number))
  }, [data, filter, sort, kind])
  const mean = data?.picks.length ? data.picks.reduce((a, p) => a + p.score, 0) / data.picks.length : 0

  const aside = data && (
    <>
      <Card title="How they are scored" theme="butter" delay={0.1}>
        <ul className="d-weights">
          {Object.entries(data.weights).map(([k, w]) => (
            <li key={k}><span>{PART_LABEL[k] ?? k}</span><b>×{w}</b></li>
          ))}
        </ul>
        <p className="d-muted small">Jev judges each issue once; the score is the weighted mix of these parts.</p>
      </Card>
      <Card title="Next step" delay={0.15}>
        <p className="d-muted small" style={{ marginTop: 0 }}>Found one you like? Turn it into a reading trail.</p>
        <button className="d-chip" onClick={() => navigate('/app/tour')}>Open Tour →</button>
      </Card>
    </>
  )

  return (
    <div className="d-body">
      <PageHead theme="butter" kicker="Good first issues" title="Start" oblique="small" note="Open issues nobody has fixed yet, ranked by how gentle a first contribution they make." actions={<RefreshButton busy={reloading} onClick={reload} />} />
      <Gate />
      {error && <Note tone="error">{error}</Note>}
      {loading && !data && <Loading label="Sorting the issues" />}
      {data && (
        <>
          <Kpis
            items={[
              { label: 'Open, unfixed', value: data.open_unlinked, color: 'var(--yellow)' },
              { label: 'Ranked', value: data.annotated, color: 'var(--violet)' },
              { label: 'Shown', value: picks.length, color: 'var(--green)' },
              { label: 'Mean gentleness', value: Math.round(mean * 100), color: 'var(--orange)' },
            ]}
          />
          {data.picks.length > 0 && (
            <div className="d-bento">
              <Card span={5} title="How gentle" delay={0.05} aside={<span className="d-muted">score spread</span>}>
                <Columns data={histogram(data.picks.map((p) => p.score), 10, 'var(--yellow)')} h={150} ticks={5} />
              </Card>
              <Card span={3} title="Kinds" delay={0.1}>
                <Donut data={kinds.map((k, i) => ({ label: k, value: data.picks.filter((p) => p.kind === k).length, color: PALETTE[i % PALETTE.length] }))} legend={false} size={150} label="issues" picked={kind === 'all' ? undefined : kind} onPick={(sl) => setKind(kind === sl.label ? 'all' : sl.label)} />
              </Card>
              <Card span={4} title="Clear and self-contained" delay={0.15}>
                <Scatter h={150} x="clear scope" y="little prior knowledge" points={data.picks.map((p) => ({ label: `#${p.number} ${p.title}`, x: p.parts.scope_clarity ?? 0, y: 1 - (p.parts.prior_knowledge_needed ?? 0), color: open === p.number ? 'var(--orange)' : 'var(--violet)', r: 4 + p.score * 5, onClick: () => setOpen(p.number) }))} />
              </Card>
            </div>
          )}
          <Split aside={aside}>
            <div className="d-toolbar">
              <input className="field d-toolbar__search" placeholder="Filter by title, number or label" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter issues" />
              <Select label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Every kind' }, ...kinds.map((k) => ({ value: k, label: k }))]} />
              <Select label="Sort" value={sort} onChange={setSort} align="end" options={[{ value: 'score', label: 'Gentlest first' }, { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
            </div>
            {data.picks.length === 0 ? (
              <Card>
                <Empty title="No issues ranked yet">
                  Run <span className="mono">bin/trailhead pick --limit 30</span> to rank the newest open issues; at about one request a minute on the free tier that takes half an hour.
                </Empty>
              </Card>
            ) : picks.length === 0 ? (
              <Card><Empty title="Nothing matches">Try a different filter.</Empty></Card>
            ) : (
              <div className="d-issues">
                <AnimatePresence initial={false}>
                  {picks.map((p, i) => (
                    <motion.article key={`${p.engine}-${p.number}`} layout className={`d-issue ${open === p.number ? 'is-open' : ''}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ delay: Math.min(i, 10) * 0.03, ease: EASE, duration: 0.45 }}>
                      <button className="d-issue__head" onClick={() => setOpen(open === p.number ? null : p.number)} aria-expanded={open === p.number} data-cursor={open === p.number ? 'Collapse' : 'Show the breakdown'}>
                        <span className="d-issue__score" style={{ ['--p' as string]: p.score }}>
                          <svg viewBox="0 0 36 36" aria-hidden><circle cx={18} cy={18} r={15} /><motion.circle cx={18} cy={18} r={15} initial={{ pathLength: 0 }} animate={{ pathLength: p.score }} transition={{ duration: 0.9, ease: EASE, delay: 0.1 + Math.min(i, 10) * 0.03 }} /></svg>
                          <b>{Math.round(p.score * 100)}</b>
                        </span>
                        <span className="d-issue__text">
                          <span className="d-issue__title"><span className="d-muted">#{p.number}</span> {p.title}</span>
                          <span className="d-row" style={{ gap: 6 }}>
                            <span className="d-tag">{p.kind}</span>
                            {p.labels.slice(0, 3).map((l) => <span key={l} className="d-tag is-soft">{l}</span>)}
                            {p.engine !== 'jev' && <span className="d-muted small">judged by {p.engine}</span>}
                          </span>
                        </span>
                        <motion.span className="d-stop__chev" animate={{ rotate: open === p.number ? 90 : 0 }}>›</motion.span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open === p.number && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: 'hidden' }}>
                            <div className="d-issue__body">
                              <div className="d-issue__viz">
                              <Radar size={200} axes={Object.keys(p.parts).map((k) => PART_LABEL[k] ?? k)} series={[{ label: `#${p.number}`, values: Object.entries(p.parts).map(([k, v]) => (k === 'prior_knowledge_needed' ? 1 - v : v)), color: 'var(--violet)' }]} />
                              <div className="d-issue__parts">
                                {Object.entries(p.parts).map(([k, v]) => (
                                  <span key={k}><span className="small">{PART_LABEL[k] ?? k}</span><Prob p={k === 'prior_knowledge_needed' ? 1 - v : v} width={90} color="var(--violet)" /></span>
                                ))}
                              </div>
                              </div>
                              <div className="d-row">
                                <a className="d-chip" href={p.url} target="_blank" rel="noreferrer noopener">Open on GitHub ↗</a>
                                <button className="d-chip" onClick={() => navigate(`/app/tour?q=${encodeURIComponent(`Fix issue #${p.number}: ${p.title}`)}`)}>Plan a tour for it →</button>
                                <button className="d-chip" onClick={() => navigate(`/app/ask?q=${encodeURIComponent(`Where would I start fixing: ${p.title}?`)}`)}>Ask where to start</button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </Split>
        </>
      )}
    </div>
  )
}
