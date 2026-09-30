import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useState } from 'react'
import { useDash } from '../context'
import { Card, EASE, Empty, Loading, Note, PageHead, Prob, q, useFetch } from '../ui'

type Decision = { id: number; call_id: string; ts: number; purpose: string; engine: string; model_id: string; provider: string; question_id: string; question_type: string; answer: string; probabilities: string; confidence: number | null; action: string; latency_ms: number; input_tokens: number; cached: number }

export default function Decisions() {
  const { repo } = useDash()
  const [limit, setLimit] = useState(80)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const { data, error, loading, reload } = useFetch<Decision[]>(repo ? `/api/decisions?limit=${limit}&${q(repo)}` : null)
  const rows = (data ?? []).filter((d) => !filter || `${d.purpose} ${d.question_id} ${d.answer} ${d.engine}`.toLowerCase().includes(filter.toLowerCase()))
  const purposes = [...new Set((data ?? []).map((d) => d.purpose))]

  return (
    <>
      <PageHead theme="paper" kicker="Audit log" title="Every" oblique="decision" note="each judgement Jev made, with its probabilities, what code did with it, and whether it came from the cache" />
      <div className="d-body">
        {error && <Note tone="error">{error}</Note>}
        <div className="d-row">
          <input className="field" style={{ maxWidth: 320, padding: '10px 14px', fontSize: 15, ['--fg' as string]: 'var(--ink)' }} placeholder="Filter by purpose, question or answer" value={filter} onChange={(e) => setFilter(e.target.value)} />
          {purposes.slice(0, 6).map((p) => <button key={p} className="d-chip" onClick={() => setFilter(filter === p ? '' : p)} style={filter === p ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}>{p}</button>)}
          <button className="d-chip" onClick={reload} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
        </div>
        {loading && !data && <Loading label="Opening the log book" />}
        {data && rows.length === 0 && <Card><Empty title="No decisions yet">Ask a question or plan a tour and every judgement lands here.</Empty></Card>}
        {rows.length > 0 && (
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table className="d-table">
                <thead><tr><th>When</th><th>Purpose</th><th>Question</th><th>Answer</th><th>Conf.</th><th>Engine</th><th>What code did</th></tr></thead>
                <tbody>
                  {rows.map((d) => {
                    let probs: Record<string, number> = {}
                    try { probs = JSON.parse(d.probabilities) } catch { /* not JSON */ }
                    return (
                      <Fragment key={d.id}>
                        <tr onClick={() => setOpen(open === d.id ? null : d.id)} style={{ cursor: 'pointer' }}>
                          <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(d.ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="small">{d.purpose}</td>
                          <td className="mono small">{d.question_id}</td>
                          <td style={{ fontWeight: 700, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.answer}</td>
                          <td>{d.confidence != null ? <Prob p={d.confidence} width={40} /> : '—'}</td>
                          <td className="small">{d.engine}{d.cached ? <span className="pill" style={{ marginLeft: 6, ['--fg' as string]: 'var(--pine)' }}>cached</span> : ''}</td>
                          <td className="small" style={{ maxWidth: 260 }}>{d.action || '—'}</td>
                        </tr>
                        <AnimatePresence>
                          {open === d.id && (
                            <tr>
                              <td colSpan={7} style={{ background: 'var(--paper-2)' }}>
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ ease: EASE, duration: 0.3 }} style={{ overflow: 'hidden', display: 'grid', gap: 6 }}>
                                  <div className="small">{d.question_type} · {d.model_id} via {d.provider} · {Math.round(d.latency_ms)} ms · {d.input_tokens} input tokens · call <span className="mono">{d.call_id.slice(0, 12)}</span></div>
                                  <div className="d-row">{Object.entries(probs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => <span key={k} className="small" style={{ display: 'inline-flex', gap: 6 }}><span className="mono">{k}</span> <Prob p={v} width={50} /></span>)}</div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {data && data.length >= limit && <button className="d-chip" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 120)}>Show more</button>}
          </Card>
        )}
      </div>
    </>
  )
}
