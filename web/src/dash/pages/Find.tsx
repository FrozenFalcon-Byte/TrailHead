import { motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BeamColumns } from '../../motion/BeamColumns'
import { useDash } from '../context'
import { Card, EASE, Empty, Gate, JobStatus, Note, PageHead, Prob, toBeamSteps, useJob } from '../ui'

type NavData = { query: string; paths: { nodes: string[]; score: number; file: string; edge_probabilities: number[] }[]; steps: any[]; symbols: Record<string, { name: string; line: number }>; separation_ratio: number | null; requests: number; cached_requests: number; input_tokens: number; latency_ms: number }

const EXAMPLES = ['Where is the robots.txt check?', 'Where are cookies merged into outgoing requests?', 'Where does the crawler decide to stop when idle?']

export default function Find() {
  const { repo, engine } = useDash()
  const job = useJob<NavData>('/api/where')
  const [query, setQuery] = useState('')
  const run = (text = query) => {
    if (text.trim().length < 3 || !repo) return
    setQuery(text)
    job.start({ question: text.trim(), repo, engine })
  }
  // each nav_depth event carries only the depth that just finished
  const depths = job.events.filter((e) => e.kind === 'nav_depth').map((e) => e.data)
  const live = depths[depths.length - 1]
  const steps = job.result?.steps ?? depths.flatMap((d) => d.steps)
  const beam: { nodes: string[]; score: number }[] = live?.beam ?? []
  const r = job.result

  return (
    <>
      <PageHead theme="peach" kicker="Navigation" title="Find the" oblique="file" note="no embeddings, no grep — Jev reads the tree one level at a time and keeps the three best branches.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask" style={{ marginTop: 26, maxWidth: 980 }}>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Where is the robots.txt check?" aria-label="What are you looking for" maxLength={500} />
          <button className="btn" type="submit" disabled={job.running || !repo || query.trim().length < 3}><span>{job.running ? 'Searching…' : 'Find'}</span><span className="arrow">→</span></button>
        </form>
        <div className="d-row" style={{ marginTop: 14 }}>
          {EXAMPLES.map((ex) => <button key={ex} className="d-chip" disabled={job.running} onClick={() => run(ex)} style={{ background: 'color-mix(in srgb, var(--orange) 16%, transparent)', color: 'var(--orange)' }}>{ex}</button>)}
        </div>
      </PageHead>
      <div className="d-body">
        <Gate />
        <JobStatus running={job.running} stage={depths.length ? `Depth ${depths.length + 1}: asking about the kept branches` : 'Reading the top of the tree'} elapsed={job.elapsed} onCancel={job.cancel} />
        {job.error && <Note tone="error">{job.error}</Note>}
        {r && (
          <Card theme="peach" title="Most likely here" aside={<span className="small">{r.requests} requests ({r.cached_requests} cached) · {(r.latency_ms / 1000).toFixed(1)}s{r.separation_ratio ? ` · separation ${r.separation_ratio.toFixed(2)}` : ''}</span>}>
            <div style={{ display: 'grid', gap: 14 }}>
              {r.paths.map((p, i) => (
                <motion.div key={p.file} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1, ease: EASE, duration: 0.6 }}>
                  <div className="d-row" style={{ fontSize: i === 0 ? 20 : 16, fontWeight: i === 0 ? 800 : 600 }}>
                    <span className="display" style={{ fontSize: i === 0 ? 34 : 24, width: 34 }}>{i + 1}</span>
                    <Link to={`/app/map?file=${encodeURIComponent(p.file)}`} className="mono">{p.file}</Link>
                    {r.symbols[p.file] && <span className="small">→ <b>{r.symbols[p.file].name}</b> line {r.symbols[p.file].line}</span>}
                    <span style={{ marginLeft: 'auto' }}><Prob p={p.score} color="var(--orange)" /></span>
                  </div>
                  <div className="small mono" style={{ opacity: 0.7, paddingLeft: 44 }}>
                    {p.nodes.map((n, j) => <span key={n}>{j > 0 && ' → '}{n.split('/').pop() || '/'} <span style={{ opacity: 0.7 }}>({p.edge_probabilities[j]?.toFixed(2)})</span></span>)}
                  </div>
                </motion.div>
              ))}
              {r.paths.length === 0 && <p>No path cleared the bar, so nothing is claimed.</p>}
            </div>
          </Card>
        )}
        {steps.length > 0 && (
          <Card title="Every question Jev answered on the way down">
            <BeamColumns steps={toBeamSteps(steps)} />
            {!r && beam.length > 0 && (
              <div style={{ marginTop: 12 }} className="small">
                Beam now: {beam.map((b) => <span key={b.nodes.join('/')} className="mono" style={{ marginRight: 12 }}>{b.nodes[b.nodes.length - 1] || '/'} ({b.score.toFixed(2)})</span>)}
              </div>
            )}
          </Card>
        )}
        {!steps.length && !job.running && <Card><Empty title="Describe what you are looking for">In plain words. Trailhead answers with the file, the function, and how sure it is.</Empty></Card>}
      </div>
    </>
  )
}
