import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { listSaved, saveItem, type Saved } from '../../lib/history'
import { TrailPath } from '../../motion/TrailPath'
import { TrailSpinner } from '../../motion/TrailSpinner'
import { useDash } from '../context'
import { ago, Card, EASE, Empty, JobStatus, Note, PageHead, Prob, useJob } from '../ui'

type Stop = { path: string; need: number; entry: number; tentative: boolean; summary: string; why: string; look_at: string[]; sources: string[]; history: { ref: string; title: string; url: string }[]; url: string }
type Candidate = { path: string; sources: string[]; need: number | null; entry: number | null; nav_score: number; history_score: number }
type TourData = { goal: string; stops: Stop[]; candidates: Candidate[]; requests: number; input_tokens: number; notes: string; skipped: Record<string, string>; navigation: any }

const GOALS = [
  'I want to add a new retry policy that backs off exponentially.',
  'I need to understand how item pipelines process scraped items.',
  'Fix a bug where cookies are not sent after a redirect.',
]
const SOURCE_LABEL: Record<string, string> = { navigation: 'found by navigation', history: 'changed in similar past work', imports: 'imported by the main file' }

export default function TourPage() {
  const { repo, engine } = useDash()
  const job = useJob<TourData>('/api/tour')
  const [goal, setGoal] = useState('')
  const [notes, setNotes] = useState(true)
  const [tour, setTour] = useState<TourData | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [replanning, setReplanning] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(0)
  const [history, setHistory] = useState<Saved<TourData>[]>([])
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (!repo) return
    listSaved<TourData>('tours', repo).then((rows) => {
      setHistory(rows)
      const hit = rows.find((r) => r.id === params.get('saved'))
      if (hit) {
        setTour(hit.payload)
        setGoal(hit.payload.goal)
      }
    }).catch(() => setHistory([]))
  }, [repo])

  const keep = async (t: TourData) => {
    try {
      const row = await saveItem('tours', repo, t.goal.split('\n')[0].slice(0, 140), t)
      setHistory((h) => [row, ...h])
    } catch {
      /* shown on screen regardless */
    }
  }

  const plan = async (text = goal) => {
    if (text.trim().length < 3 || !repo) return
    setGoal(text)
    setTour(null)
    setFeedback({})
    setError('')
    setParams({})
    let final: TourData | null = null
    await job.start({ goal: text.trim(), repo, engine, notes }, (kind, data) => {
      if (kind === 'done') final = data
    })
    if (final) {
      setTour(final)
      setOpen(0)
      keep(final)
    }
  }

  const replan = async () => {
    if (!tour) return
    setReplanning(true)
    setError('')
    try {
      const next = await api<TourData>('/api/tour/replan', { method: 'POST', body: JSON.stringify({ tour, feedback, repo }) })
      setTour(next)
      setFeedback({})
      setOpen(0)
      keep(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setReplanning(false)
    }
  }

  const candidates: Candidate[] = tour?.candidates ?? job.events.find((e) => e.kind === 'candidates')?.data.candidates ?? []
  const stage = !job.events.some((e) => e.kind === 'navigation') ? 'Navigating toward the goal' : !candidates.length ? 'Collecting files from similar past changes' : 'Jev is judging which files you need, then the notes are written'

  return (
    <>
      <PageHead theme="pine" kicker="Guided tour" title="Your reading" oblique="trail" note="Tell it what you want to do. It hands you the files to read, in the order that makes sense.">
        <form onSubmit={(e) => { e.preventDefault(); plan() }} style={{ marginTop: 26, maxWidth: 980, display: 'grid', gap: 10 }}>
          <textarea className="field" rows={3} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="I want to add a new retry policy that backs off exponentially." maxLength={1200} aria-label="Goal" style={{ resize: 'vertical' }} />
          <div className="d-row">
            <button className="btn" type="submit" disabled={job.running || !repo || goal.trim().length < 3}><span>{job.running ? 'Planning…' : 'Plan my tour'}</span><span className="arrow">→</span></button>
            <label className="small" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} /> write notes for each stop
            </label>
          </div>
          <div className="d-row">
            {GOALS.map((g) => <button key={g} type="button" className="d-chip" disabled={job.running} onClick={() => plan(g)} style={{ background: 'color-mix(in srgb, var(--lichen) 16%, transparent)', color: 'var(--lichen)' }}>{g}</button>)}
          </div>
        </form>
      </PageHead>
      <div className="d-body">
        <JobStatus running={job.running} stage={stage} elapsed={job.elapsed} onCancel={job.cancel} />
        {(job.error || error) && <Note tone="error">{job.error || error}</Note>}

        {tour && (
          <>
            <Card theme="pine" title={<>The trail · {tour.stops.length} stops</>} aside={<span className="small">{tour.requests} Jev requests · {tour.input_tokens.toLocaleString()} tokens</span>}>
              <TrailPath key={tour.stops.map((s) => s.path).join('|')} stops={tour.stops.map((s) => ({ label: s.path.split('/').pop() ?? s.path, tentative: s.tentative }))} height={260} color="var(--lichen)" />
              <p className="small" style={{ opacity: 0.7, marginTop: 8 }}>Solid blazes: Jev is confident you need the file (ordered so imports come first). Dashed: worth a look, but less certain.</p>
            </Card>

            <div style={{ display: 'grid', gap: 12 }}>
              {tour.stops.map((s, i) => {
                const fb = feedback[s.path]
                return (
                  <motion.article key={s.path} layout initial={{ opacity: 0, y: 24 }} animate={{ opacity: fb ? 0.55 : 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.6, ease: EASE }} className="d-card" style={{ borderLeft: `8px ${s.tentative ? 'dashed' : 'solid'} var(--blaze)` }}>
                    <button onClick={() => setOpen(open === i ? null : i)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, width: '100%' }} aria-expanded={open === i}>
                      <span className="display" style={{ fontSize: 48, color: 'var(--blaze)', width: 44 }}>{i + 1}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="mono" style={{ fontWeight: 800, fontSize: 16, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.path}</span>
                        <span className="small" style={{ opacity: 0.65 }}>{s.sources.map((x) => SOURCE_LABEL[x] ?? x).join(' · ')}{s.tentative ? ' · tentative' : ''}</span>
                      </span>
                      <span className="small" style={{ display: 'grid', gap: 2, justifyItems: 'end' }}>
                        <span>need <Prob p={s.need} width={60} /></span>
                        <span>start here <Prob p={s.entry} width={60} color="var(--pine)" /></span>
                      </span>
                      <motion.span animate={{ rotate: open === i ? 90 : 0 }} style={{ fontWeight: 900 }}>›</motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} style={{ overflow: 'hidden' }}>
                          <div style={{ paddingTop: 14, display: 'grid', gap: 10 }}>
                            {s.why ? <p className="body" style={{ margin: 0 }}>{s.why}</p> : <p className="body" style={{ margin: 0, opacity: 0.7 }}>{s.summary}</p>}
                            {s.look_at.length > 0 && (
                              <div className="d-row"><span className="hand" style={{ fontSize: 22, color: 'var(--bark)' }}>look at →</span>{s.look_at.map((x) => <span key={x} className="pill mono" style={{ ['--fg' as string]: 'var(--pine)' }}>{x}</span>)}</div>
                            )}
                            {s.history.length > 0 && (
                              <div className="small" style={{ display: 'grid', gap: 4 }}>
                                <b>Past changes that touched it</b>
                                {s.history.slice(0, 4).map((h) => <a key={h.ref} href={h.url} target="_blank" rel="noreferrer noopener"><span className="mono">{h.ref.replace(/^commit:(\w{8})\w*/, 'commit:$1')}</span> — {h.title}</a>)}
                              </div>
                            )}
                            <div className="d-row">
                              {s.url && <a className="btn small ghost" href={s.url} target="_blank" rel="noreferrer noopener" style={{ ['--fg' as string]: 'var(--ink)' }}><span>Open on GitHub ↗</span></a>}
                              {(['known', 'irrelevant'] as const).map((kind) => (
                                <button key={kind} className="d-chip" onClick={() => setFeedback((f) => { const n = { ...f }; if (n[s.path] === kind) delete n[s.path]; else n[s.path] = kind; return n })} style={fb === kind ? { background: 'var(--ink)', color: 'var(--paper)' } : undefined}>
                                  {kind === 'known' ? 'I already know this' : 'Not relevant to me'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.article>
                )
              })}
            </div>

            <AnimatePresence>
              {Object.keys(feedback).length > 0 && (
                <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ ease: EASE, duration: 0.5 }} style={{ position: 'sticky', bottom: 18, zIndex: 5 }}>
                  <div className="d-row t-bark" style={{ padding: '14px 18px', borderRadius: 16, boxShadow: '0 20px 40px -20px rgba(0,0,0,.5)' }}>
                    <span style={{ fontWeight: 700 }}>{Object.keys(feedback).length} stop{Object.keys(feedback).length > 1 ? 's' : ''} marked. Re-planning reuses Jev's earlier judgements, so it costs no new requests.</span>
                    <button className="btn small" onClick={replan} disabled={replanning} style={{ marginLeft: 'auto' }}><span>{replanning ? <TrailSpinner /> : 'Re-plan'}</span><span className="arrow">→</span></button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {Object.keys(tour.skipped).length > 0 && <Note>Skipped by your feedback: {Object.entries(tour.skipped).map(([p, k]) => `${p} (${k})`).join(', ')}</Note>}
          </>
        )}

        {candidates.length > 0 && (
          <Card title="Every file Jev considered" aside={<span className="small" style={{ opacity: 0.6 }}>judged in one request</span>}>
            <div style={{ overflowX: 'auto' }}>
            <table className="d-table" style={{ minWidth: 620 }}>
              <thead><tr><th>File</th><th>Why it was a candidate</th><th>Need</th><th>Entry</th></tr></thead>
              <tbody>
                {[...candidates].sort((a, b) => (b.need ?? 0) - (a.need ?? 0)).map((c) => (
                  <tr key={c.path} style={{ opacity: tour?.stops.some((s) => s.path === c.path) ? 1 : 0.6 }}>
                    <td className="mono">{c.path}</td>
                    <td className="small">{c.sources.map((x) => SOURCE_LABEL[x] ?? x).join(', ')}</td>
                    <td>{c.need != null ? <Prob p={c.need} width={50} /> : '—'}</td>
                    <td>{c.entry != null ? <Prob p={c.entry} width={50} color="var(--pine)" /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        )}

        {!tour && !job.running && repo && <Card><Empty title="Where do you want to go?">A tour is 3 to 7 files. Stops Jev is confident about come first, in import order; the rest are marked tentative.</Empty></Card>}

        {history.length > 0 && (
          <Card title="Saved tours">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((h) => (
                <button key={h.id} className="d-chip" style={{ justifyContent: 'space-between', borderRadius: 12 }} onClick={() => { setTour(h.payload); setGoal(h.payload.goal); setFeedback({}); setParams({ saved: h.id }) }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                  <span className="small" style={{ opacity: 0.6, flexShrink: 0 }}>{h.payload.stops.length} stops · {ago(h.created_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
