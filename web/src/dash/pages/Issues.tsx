import { motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { useDash } from '../context'
import { Card, EASE, Empty, Loading, Note, PageHead, Prob, q, useFetch } from '../ui'

type Pick = { number: number; title: string; url: string; labels: string[]; score: number; parts: Record<string, number>; kind: string; engine: string }
type IssuesData = { weights: Record<string, number>; picks: Pick[]; open_unlinked: number; annotated: number }
const PART_LABEL: Record<string, string> = { scope_clarity: 'clear scope', prior_knowledge_needed: 'little prior knowledge', has_acceptance_criteria: 'says when it is done', touches_single_area: 'one area of code' }

export default function Issues() {
  const { repo } = useDash()
  const { data, error, loading } = useFetch<IssuesData>(repo ? `/api/issues?${q(repo)}` : null)
  return (
    <>
      <PageHead theme="butter" kicker="Good first issues" title="Start" oblique="small" note="open issues nobody has fixed yet, ranked by how gentle a first contribution they make" />
      <div className="d-body">
        {error && <Note tone="error">{error}</Note>}
        {loading && !data && <Loading label="Sorting the issues" />}
        {data && (
          <>
            <div className="d-row">
              <span className="pill" style={{ ['--fg' as string]: 'var(--violet)' }}>{data.annotated} ranked of {data.open_unlinked} open, unfixed issues</span>
              {Object.entries(data.weights).map(([k, w]) => <span key={k} className="small" style={{ opacity: 0.7 }}>{PART_LABEL[k] ?? k} ×{w}</span>)}
            </div>
            {data.picks.length === 0 ? (
              <Card>
                <Empty title="No issues ranked yet">
                  Jev judges each issue once and the result is stored. Run <span className="mono">bin/trailhead pick --limit 30</span> to rank the newest open issues; at about one request a minute on the free tier that takes half an hour.
                </Empty>
              </Card>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {data.picks.map((p, i) => (
                  <motion.a key={`${p.engine}-${p.number}`} href={p.url} target="_blank" rel="noreferrer noopener" className="d-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.05, ease: EASE, duration: 0.55 }} whileHover={{ y: -3 }} style={{ textDecoration: 'none', display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'center' }}>
                    <span className="display" style={{ fontSize: 44, color: 'var(--violet)' }}>{Math.round(p.score * 100)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 750, display: 'block' }}>#{p.number} {p.title}</span>
                      <span className="d-row" style={{ gap: 6, marginTop: 6 }}>
                        <span className="pill" style={{ ['--fg' as string]: 'var(--violet)' }}>{p.kind}</span>
                        {p.labels.slice(0, 4).map((l) => <span key={l} className="pill" style={{ ['--fg' as string]: 'var(--ink)' }}>{l}</span>)}
                        {p.engine !== 'jev' && <span className="small" style={{ opacity: 0.6 }}>judged by {p.engine}</span>}
                      </span>
                    </span>
                    <span style={{ display: 'grid', gap: 3, justifyItems: 'end' }} className="small">
                      {Object.entries(p.parts).map(([k, v]) => <span key={k}>{PART_LABEL[k] ?? k} <Prob p={k === 'prior_knowledge_needed' ? 1 - v : v} width={46} color="var(--violet)" /></span>)}
                    </span>
                  </motion.a>
                ))}
              </div>
            )}
            <p className="small" style={{ opacity: 0.55 }}>Found one you like? Paste it into a <Link to="/app/tour">tour</Link> as your goal.</p>
          </>
        )}
      </div>
    </>
  )
}
