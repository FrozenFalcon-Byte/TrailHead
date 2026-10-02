import { useEffect, useRef, useState } from 'react'
import { TypedField } from '../../motion/TypedField'
import { FIND_EXAMPLES } from '../examples'
import { useSearchParams } from 'react-router-dom'
import { toast } from '../../lib/toast'
import { BeamColumns } from '../../motion/BeamColumns'
import { useDash } from '../context'
import { Columns, Flow, Gauge, TrailLoop } from '../viz'
import { Card, Empty, Gate, JobStatus, Kpis, Note, PageHead, Prob, Row, Split, toBeamSteps, useJob } from '../ui'

type NavData = { query: string; paths: { nodes: string[]; score: number; file: string; edge_probabilities: number[] }[]; steps: any[]; symbols: Record<string, { name: string; line: number }>; separation_ratio: number | null; requests: number; cached_requests: number; input_tokens: number; latency_ms: number }

const EXAMPLES = ['Where is the robots.txt check?', 'Where are cookies merged into outgoing requests?', 'Where does the crawler decide to stop when idle?']

export default function Find() {
  const { repo, engine } = useDash()
  const job = useJob<NavData>('/api/where')
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()
  const auto = useRef(false)
  const run = async (text = query) => {
    if (text.trim().length < 3 || !repo) return
    setQuery(text)
    setParams({})
    let final: NavData | null = null
    await job.start({ question: text.trim(), repo, engine }, (kind, data) => {
      if (kind === 'done') final = data
    })
    const done = final as NavData | null
    if (done) toast({ tone: 'job', title: done.paths.length ? `Found ${done.paths[0].file.split('/').pop()}` : 'Nothing cleared the bar', body: text.trim() })
  }
  useEffect(() => {
    const pre = params.get('q')
    if (!repo || !pre || auto.current) return
    auto.current = true
    setQuery(pre)
    if (params.get('run') === '1') run(pre)
  }, [repo])

  // each nav_depth event carries only the depth that just finished
  const depths = job.events.filter((e) => e.kind === 'nav_depth').map((e) => e.data)
  const live = depths[depths.length - 1]
  const steps = job.result?.steps ?? depths.flatMap((d) => d.steps)
  const beam: { nodes: string[]; score: number }[] = live?.beam ?? []
  const r = job.result

  const aside = (
    <>
      <Card title="Try one" delay={0.1}>
        <div className="d-list">
          {EXAMPLES.map((ex, i) => <Row key={ex} i={i} onClick={() => run(ex)} lead={<span className="d-li__dir">⌕</span>} title={ex} />)}
        </div>
      </Card>
      <Card title="How Find works" theme="peach" delay={0.15}>
        <ol className="d-steps">
          <li><b>Read</b> the summaries at the top of the tree.</li>
          <li><b>Keep</b> the three most likely branches.</li>
          <li><b>Descend</b> one level at a time until files.</li>
          <li><b>Score</b> each path by its edge probabilities.</li>
        </ol>
        <p className="d-muted small">No embeddings, no grep — just Jev reading the map.</p>
      </Card>
    </>
  )

  return (
    <div className="d-body">
      <PageHead theme="peach" kicker="Navigation" title="Find the" oblique="file" note="Describe it in plain words; get the file, the function, and how sure it is.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask">
          <TypedField value={query} onValue={setQuery} suggestions={FIND_EXAMPLES} aria-label="What are you looking for" maxLength={500} />
          <button className="btn" type="submit" disabled={job.running || !repo || query.trim().length < 3}><span>{job.running ? 'Searching…' : 'Find'}</span><span className="arrow">→</span></button>
        </form>
      </PageHead>
      <Gate />
      <Split aside={aside}>
        <JobStatus running={job.running} stage={depths.length ? `Depth ${depths.length + 1}: asking about the kept branches` : 'Reading the top of the tree'} elapsed={job.elapsed} onCancel={job.cancel} />
        {job.error && <Note tone="error">{job.error}</Note>}
        {r && (
          <>
            <Kpis
              items={[
                { label: 'Requests', value: r.requests, hint: `${r.cached_requests} from cache`, color: 'var(--orange)' },
                { label: 'Time', value: `${(r.latency_ms / 1000).toFixed(1)}s`, color: 'var(--blue)' },
                { label: 'Tokens', value: r.input_tokens, color: 'var(--violet)' },
                { label: 'Separation', value: r.separation_ratio ? r.separation_ratio.toFixed(2) : '—', hint: 'top path vs the next', color: 'var(--green)' },
              ]}
            />
            {r.paths.length > 0 && (
              <Card title="The way down" delay={0.05} aside={<Gauge p={r.paths[0].score} size={56} thick={6} color="var(--orange)" label="top path" />}>
                <Flow steps={r.paths[0].nodes.map((n, j) => ({ label: n.split('/').pop() || '/', sub: r.paths[0].edge_probabilities[j] != null ? `p ${r.paths[0].edge_probabilities[j].toFixed(2)}` : undefined }))} at={r.paths[0].nodes.length} color="var(--orange)" />
                {r.paths.length > 1 && <div style={{ marginTop: 14 }}><Columns h={110} ticks={r.paths.length} color="var(--orange)" format={(v) => v.toFixed(2)} data={r.paths.map((p, i) => ({ label: `#${i + 1}`, value: p.score, hint: p.file, color: i === 0 ? 'var(--orange)' : 'var(--dim)' }))} /></div>}
              </Card>
            )}
            <Card title="Most likely here" theme="peach">
              {r.paths.length === 0 ? (
                <p>No path cleared the bar, so nothing is claimed.</p>
              ) : (
                <div className="d-list">
                  {r.paths.map((p, i) => (
                    <Row
                      key={p.file}
                      i={i}
                      to={`/app/map?file=${encodeURIComponent(p.file)}`}
                      path={p.file}
                      active={i === 0}
                      lead={<span className="d-score">{i + 1}</span>}
                      title={<span className="mono">{p.file}{r.symbols[p.file] && <span className="d-muted"> → {r.symbols[p.file].name}:{r.symbols[p.file].line}</span>}</span>}
                      sub={<span className="mono">{p.nodes.map((n, j) => `${j > 0 ? ' → ' : ''}${n.split('/').pop() || '/'} (${p.edge_probabilities[j]?.toFixed(2)})`).join('')}</span>}
                      end={<Prob p={p.score} color="var(--orange)" width={56} />}
                    />
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
        {steps.length > 0 && (
          <Card title="Every question Jev answered on the way down">
            <BeamColumns steps={toBeamSteps(steps)} />
            {!r && beam.length > 0 && (
              <div className="d-row small" style={{ marginTop: 12 }}>
                <span className="d-eyebrow">beam now</span>
                {beam.map((b) => <span key={b.nodes.join('/')} className="mono">{b.nodes[b.nodes.length - 1] || '/'} ({b.score.toFixed(2)})</span>)}
              </div>
            )}
          </Card>
        )}
        {!steps.length && !job.running && <Card><div className="d-empty-art"><TrailLoop color="var(--orange)" /></div><Empty title="Describe what you are looking for">In plain words. Trailhead answers with the file, the function, and how sure it is.</Empty></Card>}
      </Split>
    </div>
  )
}
