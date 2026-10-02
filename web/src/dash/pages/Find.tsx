import { useEffect, useRef, useState } from 'react'
import { TypedField } from '../../motion/TypedField'
import { useStarters } from '../examples'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { Shape } from '../../motion/Shapes'
import { JourneyBar, type Station } from '../Trailside'
import { FindOpening } from '../FindOpening'
import { toast } from '../../lib/toast'
import { BeamColumns } from '../../motion/BeamColumns'
import { useDash } from '../context'
import { Gate, JobStatus, Note, PageHead, Prob, toBeamSteps, useJob } from '../ui'

type NavData = { query: string; paths: { nodes: string[]; score: number; file: string; edge_probabilities: number[] }[]; steps: any[]; symbols: Record<string, { name: string; line: number }>; separation_ratio: number | null; requests: number; cached_requests: number; input_tokens: number; latency_ms: number }


export default function Find() {
  const { repo, engine } = useDash()
  const { starters } = useStarters(repo)
  const job = useJob<NavData>('/api/where')
  const [query, setQuery] = useState('')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
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

  const top = r?.paths[0]
  const others = r?.paths.slice(1) ?? []
  const level = depths.length
  const stations: Station[] = ['Read', 'Keep', 'Descend', 'Score'].map((label, i) => {
    const at = r ? 4 : job.running ? Math.min(2, level) : -1
    return {
      key: label, label,
      value: [ 'the top of the tree', beam.length ? `${beam.length} branches kept` : 'the likeliest branches', level ? `depth ${level}${r ? '' : '…'}` : 'one level at a time', r ? (top ? `${Math.round(top.score * 100)}% on the top path` : 'nothing cleared the bar') : 'every path'][i],
      state: at > i ? 'done' : at === i ? 'now' : 'todo',
    }
  })

  return (
    <div className="d-body">
      <PageHead theme="peach" kicker="Navigation" title="Find the" oblique="file" note="Describe it in plain words; get the file, the function, and how sure it is.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask">
          <TypedField value={query} onValue={setQuery} key={repo} suggestions={starters.find} aria-label="What are you looking for" maxLength={500} />
          <button className="btn" type="submit" disabled={job.running || !repo || query.trim().length < 3}><span>{job.running ? 'Searching…' : 'Find'}</span><span className="arrow">→</span></button>
        </form>
      </PageHead>
      <Gate />
      <div className="fd">
        <JobStatus running={job.running} stage={depths.length ? `Depth ${depths.length + 1}: asking about the kept branches` : 'Reading the top of the tree'} elapsed={job.elapsed} onCancel={job.cancel} />
        {job.error && <Note tone="error">{job.error}</Note>}
        {(job.running || r) && <JourneyBar id="find" stations={stations} color="var(--orange)" />}

        {r && top && (
          <div className="fd-result">
            <section className="fd-descent" aria-label="The way down">
              <span className="fd-label">The way down</span>
              <ol>
                {top.nodes.map((n, j) => {
                  const last = j === top.nodes.length - 1
                  const pr = top.edge_probabilities[j]
                  return (
                    <motion.li key={n + j} className={`fd-step ${last ? 'is-end' : ''}`} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20, delay: j * 0.12 }}>
                      <span className="fd-step__mark" aria-hidden>{last ? <Shape kind="tag" color="var(--orange)" glyph="flag" size={34} /> : <i />}</span>
                      <span className="fd-step__name mono">{j === 0 ? repo : `${n.split('/').pop()}${last ? '' : '/'}`}</span>
                      {pr != null && <span className="fd-step__p"><Prob p={pr} size={28} color={last ? 'var(--orange)' : 'var(--green)'} /></span>}
                    </motion.li>
                  )
                })}
              </ol>
              <p className="fd-note">Each dial is how sure Jev was at that fork.</p>
            </section>

            <div className="fd-right">
              <motion.section className="fd-dest" initial={{ y: 16, rotate: -1 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}>
                <div className="fd-dest__stub">
                  <Prob p={top.score} size={64} color="var(--orange)" />
                  <small>sure</small>
                </div>
                <div className="fd-dest__body">
                  <span className="fd-label">Most likely here</span>
                  <h2 className="mono" data-path={top.file}>{top.file}</h2>
                  {r.symbols[top.file] && <span className="fd-sym">→ <b className="mono">{r.symbols[top.file].name}</b> · line {r.symbols[top.file].line}</span>}
                  <div className="fd-dest__actions">
                    <button className="btn small" onClick={() => navigate(`/app/map?file=${encodeURIComponent(top.file)}`)}><span>See it on the map</span><span className="arrow">→</span></button>
                    <button className="d-chip" onClick={() => navigate(`/app/ask?q=${encodeURIComponent(`How does ${top.file} work?`)}`)}>Ask how it works</button>
                    <button className="d-chip" onClick={() => navigate(`/app/tour?q=${encodeURIComponent(`I want to understand ${top.file} and what it depends on.`)}`)}>Tour from here</button>
                  </div>
                </div>
              </motion.section>

              {others.length > 0 && (
                <section className="fd-others">
                  <span className="fd-label">Other trails</span>
                  {others.map((p, i) => (
                    <Link key={p.file} to={`/app/map?file=${encodeURIComponent(p.file)}`} className="fd-other" data-path={p.file}>
                      <span className="fd-other__n">{i + 2}</span>
                      <span className="fd-other__copy">
                        <b className="mono">{p.file}</b>
                        <small className="mono">{p.nodes.slice(1).map((n) => n.split('/').pop()).join(' › ')}{r.symbols[p.file] ? ` · ${r.symbols[p.file].name}:${r.symbols[p.file].line}` : ''}</small>
                      </span>
                      <Prob p={p.score} size={34} color="var(--dim)" />
                    </Link>
                  ))}
                </section>
              )}
              <p className="fd-foot">{r.requests} Jev requests{r.cached_requests ? ` (${r.cached_requests} cached)` : ''} · {(r.latency_ms / 1000).toFixed(1)}s{r.separation_ratio ? ` · the top path leads the next by ${r.separation_ratio.toFixed(2)}×` : ''}</p>
            </div>
          </div>
        )}
        {r && !top && <Note>No path cleared the bar, so nothing is claimed. Try describing what the code does rather than what it is called.</Note>}

        {steps.length > 0 && (
          <details className="fd-notes" open={!r}>
            <summary><b>Field notes</b><span>Every question Jev answered on the way down</span></summary>
            <BeamColumns steps={toBeamSteps(steps)} />
            {!r && beam.length > 0 && (
              <div className="d-row small" style={{ marginTop: 12 }}>
                <span className="d-eyebrow">beam now</span>
                {beam.map((b) => <span key={b.nodes.join('/')} className="mono">{b.nodes[b.nodes.length - 1] || '/'} ({b.score.toFixed(2)})</span>)}
              </div>
            )}
          </details>
        )}
        {!steps.length && !job.running && !r && repo && <FindOpening repo={repo} examples={starters.find.slice(0, 3)} onPick={(q) => run(q)} />}
      </div>
    </div>
  )
}
