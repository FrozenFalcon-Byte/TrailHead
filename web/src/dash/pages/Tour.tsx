import { AnimatePresence, motion } from 'motion/react'
import { TypedField } from '../../motion/TypedField'
import { useStarters } from '../examples'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { Columns, Scatter, TrailLoop } from '../viz'
import { deleteItem, listSaved, saveItem, type Saved } from '../../lib/history'
import { usePrefs } from '../../lib/prefs'
import { openQr, shareUrl } from '../../lib/qr'
import { errorText, notify, toast } from '../../lib/toast'
import { Toggle } from '../../motion/Select'
import { TrailPath } from '../../motion/TrailPath'
import { TrailSpinner } from '../../motion/TrailSpinner'
import { useDash } from '../context'
import { Shape } from '../../motion/Shapes'
import { Scouting, ScoutStops } from '../Scouting'
import { AnswerSheet, type AnswerLike } from '../AnswerSheet'
import { ago, Card, EASE, Empty, Gate, JobStatus, Note, PageHead, Prob, Row, Split, useJob } from '../ui'

type Stop = { path: string; need: number; entry: number; tentative: boolean; summary: string; why: string; look_at: string[]; sources: string[]; history: { ref: string; title: string; url: string }[]; url: string }
type Candidate = { path: string; sources: string[]; need: number | null; entry: number | null; nav_score: number; history_score: number }
export type TourData = { goal: string; stops: Stop[]; candidates: Candidate[]; requests: number; input_tokens: number; notes: string; skipped: Record<string, string>; navigation: any }

const SOURCE_LABEL: Record<string, string> = { navigation: 'found by navigation', history: 'changed in similar past work', imports: 'imported by the main file' }

const TOUR_STEPS = [
  { label: 'Navigate', sub: 'toward the goal' },
  { label: 'Gather', sub: 'similar past changes' },
  { label: 'Judge', sub: 'what you need' },
  { label: 'Order', sub: 'and write notes' },
]

export default function TourPage() {
  const { repo, engine } = useDash()
  const { starters } = useStarters(repo)
  const prefs = usePrefs()
  const job = useJob<TourData>('/api/tour')
  const guide = useJob<{ goal: string; answer: AnswerLike }>('/api/tour/explain')
  const [guideFor, setGuideFor] = useState('')
  const [goal, setGoal] = useState('')
  const [notes, setNotes] = useState(prefs.tourNotes)
  const [tour, setTour] = useState<TourData | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [replanning, setReplanning] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<number | null>(0)
  const scouted = useRef(false)
  const [history, setHistory] = useState<Saved<TourData>[]>([])
  const [showAll, setShowAll] = useState(false)
  const [params, setParams] = useSearchParams()
  const auto = useRef(false)

  useEffect(() => {
    if (!repo) return
    listSaved<TourData>('tours', repo)
      .then((rows) => {
        setHistory(rows)
        const hit = rows.find((r) => r.id === params.get('saved'))
        if (hit) {
          setTour(hit.payload)
          setGoal(hit.payload.goal)
        }
      })
      .catch(() => setHistory([]))
    const pre = params.get('q')
    if (pre && !auto.current) {
      auto.current = true
      setGoal(pre)
      if (params.get('run') === '1') plan(pre)
    }
  }, [repo])

  const keep = async (t: TourData, force = false) => {
    if (!prefs.autoSave && !force) return
    try {
      const row = await saveItem('tours', repo, t.goal.split('\n')[0].slice(0, 140), t)
      setHistory((h) => [row, ...h])
      if (force) notify.ok('Tour saved')
    } catch (e) {
      notify.warn('Tour not saved', errorText(e))
    }
  }

  const plan = async (text = goal) => {
    if (text.trim().length < 3 || !repo) return
    setGoal(text)
    scouted.current = true
    setTour(null)
    setFeedback({})
    setError('')
    setParams({})
    let final: TourData | null = null
    await job.start({ goal: text.trim(), repo, engine, notes }, (kind, data) => {
      if (kind === 'done') final = data
    })
    const done = final as TourData | null
    if (done) {
      setTour(done)
      setOpen(0)
      toast({ tone: 'job', title: `Tour ready · ${done.stops.length} stops`, body: text.trim().slice(0, 120) })
      keep(done)
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
      notify.ok('Re-planned', 'Reused earlier judgements, no new requests.')
      keep(next)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setReplanning(false)
    }
  }

  const share = async () => {
    if (!tour) return
    const url = await shareUrl({ k: 't', repo, goal: tour.goal, stops: tour.stops.map((s) => ({ p: s.path, w: (s.why || s.summary || '').slice(0, 240), u: s.url, ...(s.tentative ? { t: true } : {}) })), at: new Date().toISOString() })
    openQr({ title: 'Take this tour with you', url, note: 'Scan it to read the stops on your phone, or send the link to a teammate. The tour travels inside the link.', filename: 'trailhead-tour' })
  }
  const remove = async (id: string) => {
    const was = history
    setHistory((h) => h.filter((x) => x.id !== id))
    try {
      await deleteItem('tours', id)
      notify.info('Tour removed')
    } catch (e) {
      setHistory(was)
      notify.error('Could not remove it', errorText(e))
    }
  }

  const candidates: Candidate[] = tour?.candidates ?? job.events.find((e) => e.kind === 'candidates')?.data.candidates ?? []
  const scouting = job.running || (!!job.result && !tour && !job.error)
  const scoutStage = job.events.some((e) => e.kind === 'tour') ? 3 : candidates.length ? 2 : job.events.some((e) => e.kind === 'navigation') ? 1 : 0
  const stage = !job.events.some((e) => e.kind === 'navigation') ? 'Navigating toward the goal' : !candidates.length ? 'Collecting files from similar past changes' : 'Jev is judging which files you need, then the notes are written'
  const sorted = [...candidates].sort((a, b) => (b.need ?? 0) - (a.need ?? 0))

  const aside = (
    <>
      {tour && (
        <Card title="The trail" theme="mint" delay={0.05} aside={<span className="d-muted">{tour.stops.length} stops</span>}>
          <TrailPath key={tour.stops.map((s) => s.path).join('|')} stops={tour.stops.map((s) => ({ label: s.path.split('/').pop() ?? s.path, tentative: s.tentative }))} height={220} color="var(--green)" />
          <p className="d-muted small">Solid: Jev is confident you need it. Dashed: worth a look.</p>
          <div className="d-meta">
            <span><b>{tour.requests}</b> Jev requests</span>
            <span><b>{tour.input_tokens.toLocaleString()}</b> tokens</span>
          </div>
        </Card>
      )}
      <Card title="Saved tours" delay={0.1} aside={<span className="d-muted">{history.length}</span>}>
        {history.length === 0 ? (
          <p className="d-muted">Tours you plan for this repository are kept here.</p>
        ) : (
          <div className="d-list d-list--scroll">
            {history.map((h, i) => (
              <div key={h.id} className="d-li-wrap">
                <Row i={i} active={params.get('saved') === h.id} onClick={() => { setTour(h.payload); setGoal(h.payload.goal); setFeedback({}); setParams({ saved: h.id }) }} lead={<span className="d-score">{h.payload.stops.length}</span>} title={h.title} sub={ago(h.created_at)} />
                <button className="d-li__x" onClick={() => remove(h.id)} aria-label="Remove tour" data-cursor="Remove">×</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Start from a goal" delay={0.15}>
        <div className="d-list">
          {starters.tour.map((g, i) => <Row key={repo + g} i={i} onClick={() => plan(g)} lead={<span className="d-li__dir">→</span>} title={g} />)}
        </div>
      </Card>
    </>
  )

  return (
    <div className="d-body">
      <PageHead theme="mint" kicker="Guided tour" title="Your reading" oblique="trail" note="Say what you want to do; get the files to read, in order.">
        <form onSubmit={(e) => { e.preventDefault(); plan() }} className="d-compose">
          <TypedField multiline rows={2} value={goal} onValue={setGoal} key={repo} suggestions={starters.tour} maxLength={1200} aria-label="Goal" />
          <div className="d-compose__bar">
            <label className="d-opt">
              <Toggle on={notes} onChange={setNotes} label="Write notes for each stop" />
              <span className="small">Notes for each stop</span>
            </label>
            <button className="btn" type="submit" disabled={job.running || !repo || goal.trim().length < 3}><span>{job.running ? 'Planning…' : 'Plan my tour'}</span><span className="arrow">→</span></button>
          </div>
        </form>
      </PageHead>
      <Gate />
      <Split aside={aside}>
        <JobStatus running={job.running} stage={stage} elapsed={job.elapsed} onCancel={job.cancel} />
        <AnimatePresence>
          {scouting && (
            <motion.div key="scout" className="sc-wrap" initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 28 }}>
              <Scouting stage={scoutStage} labels={TOUR_STEPS.map((t) => t.label)} pins={[...candidates].sort((a, b) => (b.need ?? 0) - (a.need ?? 0)).map((c) => c.path)} />
            </motion.div>
          )}
        </AnimatePresence>
        {scouting && <ScoutStops count={Math.max(3, Math.min(5, candidates.filter((c) => (c.need ?? 0) >= 0.5).length || 3))} />}
        {(job.error || error) && <Note tone="error">{job.error || error}</Note>}

        {tour && (
          <>
            <section className="tg">
              <span className="tg-mark" aria-hidden><Shape kind="circle" color="var(--blue)" glyph="flag" size={44} /></span>
              <div className="tg-copy">
                <b>Trail guide</b>
                <span>Want it in words first? Jev reads the stops and writes a short explanation of “{tour.goal.slice(0, 70)}{tour.goal.length > 70 ? '…' : ''}”, keeping only what the files support.</span>
              </div>
              <button className="btn" disabled={guide.running} onClick={() => { setGuideFor(tour.goal + tour.stops.map((s) => s.path).join('|')); guide.start({ tour, repo, engine }) }}>
                <span>{guide.running ? 'Reading the stops…' : guideFor === tour.goal + tour.stops.map((s) => s.path).join('|') && guide.result ? 'Explain again' : 'Explain it to me'}</span><span className="arrow">→</span>
              </button>
            </section>
            {guide.running && <JobStatus running stage="Reading the stops and checking each sentence against them" elapsed={guide.elapsed} onCancel={guide.cancel} />}
            {guide.error && <Note tone="error">{/not found/i.test(guide.error) ? 'The API running now predates the trail guide. Restart it (bin/trailhead serve) and try again.' : guide.error}</Note>}
            {guide.result && guideFor === tour.goal + tour.stops.map((s) => s.path).join('|') && <AnswerSheet answer={guide.result.answer} kicker="Trail guide" title={tour.goal} />}
            <div className="d-toolbar">
              <span className="chunk d-toolbar__title">{tour.stops.length} stops</span>
              <span className="d-muted small">{tour.goal.slice(0, 90)}{tour.goal.length > 90 ? '…' : ''}</span>
              <span className="d-toolbar__end">
                <button className="d-chip" onClick={() => setOpen(open === null ? 0 : null)}>{open === null ? 'Expand first' : 'Collapse'}</button>
                {!prefs.autoSave && <button className="d-chip" onClick={() => keep(tour, true)}>Save</button>}
                <button className="d-chip" onClick={share} data-cursor="Share as link and QR">Share ▣</button>
              </span>
            </div>
            <div className="d-stops">
              {tour.stops.map((s, i) => {
                const fb = feedback[s.path]
                return (
                  <motion.article key={s.path} layout layoutId={`stop-${i}`} initial={scouted.current ? false : { x: -16, opacity: 0 }} animate={{ opacity: fb ? 0.55 : 1, x: 0 }} transition={{ delay: i * 0.07, type: 'spring', stiffness: 260, damping: 24 }} className={`d-stop ${s.tentative ? 'is-tentative' : ''} ${open === i ? 'is-open' : ''}`}>
                    <button className="d-stop__head" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} data-path={s.path} data-cursor={open === i ? 'Collapse' : 'Read why'}>
                      <span className="d-stop__n">{i + 1}</span>
                      <span className="d-stop__text">
                        <span className="mono d-stop__path">{s.path}</span>
                        <span className="d-muted small">{s.sources.map((x) => SOURCE_LABEL[x] ?? x).join(' · ')}{s.tentative ? ' · tentative' : ''}</span>
                      </span>
                      <span className="small d-stop__probs">
                        <span className="d-stop__dial"><Prob p={s.need} size={34} /><i>need</i></span>
                        <span className="d-stop__dial"><Prob p={s.entry} size={34} color="var(--green)" /><i>start here</i></span>
                      </span>
                      <motion.span className="d-stop__chev" animate={{ rotate: open === i ? 90 : 0 }}>›</motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open === i && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: EASE }} style={{ overflow: 'hidden' }}>
                          <div className="d-stop__body">
                            <p className="body">{s.why || s.summary}</p>
                            {s.look_at.length > 0 && (
                              <div className="d-row"><span className="d-eyebrow">look at</span>{s.look_at.map((x) => <span key={x} className="pill mono" style={{ ['--fg' as string]: 'var(--green)' }}>{x}</span>)}</div>
                            )}
                            {s.history.length > 0 && (
                              <div className="d-list">
                                {s.history.slice(0, 4).map((h, j) => <Row key={h.ref} i={j} href={h.url} lead={<span className="d-tag">{h.ref.split(':')[0]}</span>} title={h.title} sub={<span className="mono">{h.ref.replace(/^commit:(\w{8})\w*/, 'commit:$1')}</span>} end={<span className="d-ext">↗</span>} />)}
                              </div>
                            )}
                            <div className="d-row">
                              {s.url && <a className="d-chip" href={s.url} target="_blank" rel="noreferrer noopener">Open on GitHub ↗</a>}
                              {(['known', 'irrelevant'] as const).map((kind) => (
                                <button key={kind} className={`d-chip ${fb === kind ? 'is-on' : ''}`} onClick={() => setFeedback((f) => { const n = { ...f }; if (n[s.path] === kind) delete n[s.path]; else n[s.path] = kind; return n })}>
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
                <motion.div className="d-dock t-peach" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ ease: EASE, duration: 0.5 }}>
                  <span style={{ fontWeight: 700 }}>{Object.keys(feedback).length} stop{Object.keys(feedback).length > 1 ? 's' : ''} marked. Re-planning reuses Jev's earlier judgements, so it costs no new requests.</span>
                  <button className="btn small" onClick={replan} disabled={replanning}><span>{replanning ? <TrailSpinner /> : 'Re-plan'}</span><span className="arrow">→</span></button>
                </motion.div>
              )}
            </AnimatePresence>

            {Object.keys(tour.skipped).length > 0 && <Note>Skipped by your feedback: {Object.entries(tour.skipped).map(([p, k]) => `${p} (${k})`).join(', ')}</Note>}
          </>
        )}

        {candidates.length > 0 && (
          <Card title="Every file Jev considered" aside={<span className="d-muted">judged in one request</span>}>
            <div className="d-viz2 is-wide">
              <Scatter h={190} x="navigation score" y="past-change score" points={candidates.map((c) => {
                const stop = tour?.stops.some((st) => st.path === c.path)
                return { label: c.path, x: Math.min(1, c.nav_score), y: Math.min(1, c.history_score), color: stop ? 'var(--green)' : 'var(--dim)', r: 3 + (c.need ?? 0) * 6 }
              })} />
              <Columns h={150} ticks={4} color="var(--green)" format={(v) => v.toFixed(2)} data={sorted.slice(0, 14).map((c) => ({ label: c.path.split('/').pop() ?? c.path, value: c.need ?? 0, hint: `need · ${c.path}`, color: tour?.stops.some((st) => st.path === c.path) ? 'var(--green)' : 'var(--dim)' }))} />
            </div>
            <div className="d-table-wrap">
              <table className="d-table">
                <thead><tr><th>File</th><th>Why it was a candidate</th><th>Need</th><th>Entry</th></tr></thead>
                <tbody>
                  {(showAll ? sorted : sorted.slice(0, 8)).map((c) => (
                    <tr key={c.path} style={{ opacity: tour?.stops.some((s) => s.path === c.path) ? 1 : 0.6 }} data-path={c.path}>
                      <td className="mono">{c.path}</td>
                      <td className="small">{c.sources.map((x) => SOURCE_LABEL[x] ?? x).join(', ')}</td>
                      <td>{c.need != null ? <Prob p={c.need} width={44} /> : '—'}</td>
                      <td>{c.entry != null ? <Prob p={c.entry} width={44} color="var(--green)" /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sorted.length > 8 && <button className="d-chip" style={{ marginTop: 10 }} onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${sorted.length}`}</button>}
          </Card>
        )}

        {!tour && !job.running && repo && <Card><div className="d-empty-art"><TrailLoop color="var(--green)" /></div><Empty title="Where do you want to go?">A tour is 3 to 7 files. Stops Jev is confident about come first, in import order; the rest are marked tentative.</Empty></Card>}
      </Split>
    </div>
  )
}
