import { AnimatePresence, motion } from 'motion/react'
import { TypedField } from '../../motion/TypedField'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Donut, PALETTE, Scatter } from '../viz'
import { deleteItem, listSaved, saveItem, type Saved } from '../../lib/history'
import { usePrefs } from '../../lib/prefs'
import { openQr, shareUrl } from '../../lib/qr'
import { errorText, notify, toast } from '../../lib/toast'
import { BeamColumns } from '../../motion/BeamColumns'
import { EvidenceCard } from '../../motion/EvidenceCard'
import { useDash } from '../context'
import { useStarters } from '../examples'
import { AnswerSheet } from '../AnswerSheet'
import { JourneyBar, Logbook, Signposts, type LogEntry, type Station } from '../Trailside'
import { ago, Card, Gate, JobStatus, Note, PageHead, Prob, Row, toBeamSteps, useJob, useDecider } from '../ui'

type Evidence = { ref: string; kind: string; title: string; url: string; label: string; relevance: number | null; directness: number | null; injection: number | null; kept: boolean; reason: string; source: string }
type Claim = { id: string; text: string; evidence: string[]; p_support: number; directness: number; addresses: number; status: string; badge: string; reason: string }
type AnswerData = { status: string; text: string; confidence: number | null; abstain_reason: string; render: string; claims: Claim[]; evidence: Evidence[] }
export type AskResult = {
  question: string; engine: string; route: string; route_reason: string; route_probabilities: Record<string, number>
  navigation?: { steps: any[]; paths: { nodes: string[]; score: number; file: string }[]; symbols: Record<string, { name: string; line: number }>; requests: number; separation_ratio: number | null }
  retrieval?: { evidence: Evidence[]; requests: number }
  answer: AnswerData
}

const ROUTE_NAMES: Record<string, string> = {
  where_is: 'where is', how_does_it_work: 'how it works', why_built_this_way: 'why it was built this way',
  what_breaks_if_changed: 'what breaks', how_to_run_or_test: 'how to run or test', other: 'out of scope',
}

const ASK_STEPS = [
  { label: 'Route', sub: 'what kind of answer' },
  { label: 'Walk', sub: 'the tree to the files' },
  { label: 'Screen', sub: 'commits, PRs, code' },
  { label: 'Check', sub: 'every claim' },
]

function view(result: AskResult | null, events: { kind: string; data: any }[]): { route: any; steps: any[]; nav: any; evidence: Evidence[]; answer: AnswerData | undefined } {
  if (result)
    return { route: { route: result.route, reason: result.route_reason, probabilities: result.route_probabilities }, steps: result.navigation?.steps ?? [], nav: result.navigation, evidence: result.retrieval?.evidence ?? [], answer: result.answer }
  const last = (k: string) => [...events].reverse().find((e) => e.kind === k)?.data
  return { route: last('route'), steps: last('navigation')?.steps ?? events.filter((e) => e.kind === 'nav_depth').flatMap((e) => e.data.steps), nav: last('navigation'), evidence: last('evidence')?.evidence ?? [], answer: last('answer') as AnswerData | undefined }
}

export default function Ask() {
  const { repo, engine } = useDash()
  const { name } = useDecider()
  const { starters, ready } = useStarters(repo)
  const prefs = usePrefs()
  const job = useJob<AskResult>('/api/ask')
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Saved<AskResult>[]>([])
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'answer' | 'beam' | 'evidence'>('answer')
  const auto = useRef(false)

  useEffect(() => {
    if (!repo) return
    listSaved<AskResult>('asks', repo)
      .then((rows) => {
        setHistory(rows)
        const hit = rows.find((r) => r.id === params.get('saved'))
        if (hit) {
          setQuestion(hit.payload.question)
          job.reset(hit.payload)
        }
      })
      .catch(() => setHistory([]))
    const pre = params.get('q')
    if (pre && !auto.current) {
      auto.current = true
      setQuestion(pre)
      if (params.get('run') === '1') run(pre)
    }
  }, [repo])

  const run = async (text = question) => {
    if (text.trim().length < 3 || !repo) return
    setQuestion(text)
    setParams({})
    setTab('answer')
    let final: AskResult | null = null
    await job.start({ question: text.trim(), repo, engine }, (kind, data) => {
      if (kind === 'done') final = data
    })
    const done = final as AskResult | null
    if (!done) return
    toast({ tone: 'job', title: done.answer?.status === 'answered' ? 'Answer ready' : done.answer?.status === 'partial' ? 'Background found, no direct answer' : 'Abstained — not enough evidence', body: text.trim() })
    if (!prefs.autoSave) return
    try {
      const row = await saveItem('asks', repo, text.trim(), done)
      setHistory((h) => [row, ...h])
    } catch (e) {
      notify.warn('Answer not saved', errorText(e))
    }
  }

  const v = useMemo(() => view(job.result, job.events), [job.result, job.events])
  const stage = !v.route ? 'Routing the question and reading the top of the tree' : !v.nav && v.steps.length ? 'Beam search is walking the tree' : !v.evidence.length ? 'Gathering history and code' : !v.answer ? 'Drafting claims and checking each one against its evidence' : 'Done'
  const kept = v.evidence.filter((e: Evidence) => e.kept)
  const answer = v.answer
  const result = job.result

  const save = async () => {
    if (!result) return
    try {
      const row = await saveItem('asks', repo, result.question, result)
      setHistory((h) => [row, ...h])
      notify.ok('Saved to your trails')
    } catch (e) {
      notify.error('Could not save', errorText(e))
    }
  }
  const share = async () => {
    if (!result) return
    const url = await shareUrl({
      k: 'a', repo, q: result.question, status: result.answer.status, text: result.answer.text, conf: result.answer.confidence,
      ev: (result.answer.evidence ?? []).filter((e) => e.kept).slice(0, 8).map((e) => ({ l: e.label, r: e.ref, u: e.url, t: e.title })), at: new Date().toISOString(),
    })
    openQr({ title: 'Share this answer', url, note: 'Scan to open the answer and its citations on a phone. Everything is inside the link; nothing is uploaded.', filename: 'trailhead-answer' })
  }
  const remove = async (id: string) => {
    const was = history
    setHistory((h) => h.filter((x) => x.id !== id))
    try {
      await deleteItem('asks', id)
      notify.info('Removed from history')
    } catch (e) {
      setHistory(was)
      notify.error('Could not remove it', errorText(e))
    }
  }

  const at = answer ? ASK_STEPS.length : v.evidence.length ? 3 : v.nav || v.steps.length ? 2 : v.route ? 1 : job.running ? 0 : -1
  const kinds = [...new Set(v.evidence.map((e: Evidence) => e.kind))]
  const started = job.running || !!answer || v.steps.length > 0 || v.evidence.length > 0
  const state = (i: number): 'todo' | 'now' | 'done' => (at > i ? 'done' : at === i && job.running ? 'now' : 'todo')
  const routeName = v.route ? ROUTE_NAMES[v.route.route] ?? v.route.route : ''
  const stations: Station[] = [
    { key: 'route', label: 'Route', value: routeName || 'what kind of answer', state: state(0) },
    { key: 'walk', label: 'Walk', value: v.nav?.requests ? `${v.nav.requests} ${name} requests` : v.steps.length ? `${v.steps.length} decisions` : at > 1 ? 'not needed' : 'the tree to the files', state: state(1), onClick: v.steps.length || v.nav ? () => setTab('beam') : undefined, active: tab === 'beam' },
    { key: 'screen', label: 'Screen', value: v.evidence.length ? `${kept.length} of ${v.evidence.length} kept` : at > 2 ? 'not needed' : 'commits, PRs, code', state: state(2), onClick: v.evidence.length ? () => setTab('evidence') : undefined, active: tab === 'evidence' },
    { key: 'check', label: 'Check', value: answer ? (answer.status === 'answered' ? `${Math.round((answer.confidence ?? 0) * 100)}% sure` : answer.status === 'partial' ? 'background only' : 'not sure') : 'every claim', state: state(3), onClick: answer ? () => setTab('answer') : undefined, active: tab === 'answer' },
  ]
  const log: LogEntry[] = history.map((h) => ({
    id: h.id, title: h.title, ok: h.payload.answer?.status === 'answered', active: params.get('saved') === h.id,
    sub: `${h.payload.answer?.status === 'answered' ? 'answered' : 'not sure'} · ${ago(h.created_at)}`,
    onOpen: () => { setQuestion(h.payload.question); job.reset(h.payload); setTab('answer'); setParams({ saved: h.id }) },
    onRemove: () => remove(h.id),
  }))

  return (
    <div className="d-body">
      <PageHead theme="sky" kicker="Ask the codebase" title="Ask it" oblique="straight" note="Cited answers, or an honest “not sure”.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask">
          <TypedField value={question} onValue={setQuestion} key={repo} suggestions={starters.ask} maxLength={500} aria-label="Question" />
          <button className="btn" type="submit" disabled={job.running || !repo || question.trim().length < 3}>
            <span>{job.running ? 'Walking…' : 'Ask'}</span><span className="arrow">→</span>
          </button>
        </form>
      </PageHead>
      <Gate />
      <div className="desk">
        <div className="desk-main">
          <JobStatus running={job.running} stage={stage} elapsed={job.elapsed} onCancel={job.cancel} />
          {job.error && <Note tone="error">{job.error}</Note>}

          {started && (
            <section className="desk-journey">
              <JourneyBar id="ask" stations={stations} color="var(--blue)" />
              <div className="desk-journey__foot">
                <span className="desk-why">{v.route ? <>Routed as <b>{routeName}</b>{v.route.reason ? ` · ${v.route.reason}` : ''}</> : 'Working out what kind of question this is…'}</span>
                {v.route?.probabilities && (
                  <span className="desk-odds">
                    {Object.entries<number>(v.route.probabilities).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => (
                      <span key={k} title={ROUTE_NAMES[k] ?? k}><Prob p={p as number} size={28} color={k === v.route.route ? 'var(--blue)' : 'var(--dim)'} /><i>{ROUTE_NAMES[k] ?? k}</i></span>
                    ))}
                  </span>
                )}
                {result && (
                  <span className="desk-actions">
                    {!prefs.autoSave && <button className="d-chip" onClick={save} data-cursor="Save to history">Save</button>}
                    <button className="d-chip" onClick={share} data-cursor="Share as link and QR">Share ▣</button>
                  </span>
                )}
              </div>
            </section>
          )}

          <AnimatePresence mode="wait">
            {tab === 'answer' && answer && (
              <motion.div key="answer" initial={{ x: 24 }} animate={{ x: 0 }} exit={{ x: -24, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <AnswerSheet answer={answer} kicker={routeName ? `Route · ${routeName}` : undefined} title={result?.question ?? question} />
              </motion.div>
            )}
            {tab === 'beam' && (
              <motion.div key="beam" initial={{ x: 24 }} animate={{ x: 0 }} exit={{ x: -24, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <Card title="The beam, depth by depth" aside={v.nav && <span className="d-muted">{v.nav.requests} {name} request{v.nav.requests === 1 ? '' : 's'}{v.nav.separation_ratio ? ` · separation ${v.nav.separation_ratio.toFixed(2)}` : ''}</span>}>
                  {v.steps.length ? <BeamColumns steps={toBeamSteps(v.steps)} compact /> : <p className="d-muted">This route did not need to walk the tree.</p>}
                  {v.nav?.paths?.length > 0 && (
                    <div className="d-list" style={{ marginTop: 14 }}>
                      {v.nav.paths.map((p: { file: string; score: number }, i: number) => (
                        <Row key={p.file} i={i} to={`/app/map?file=${encodeURIComponent(p.file)}`} path={p.file} lead={<span className="d-score">{i + 1}</span>} title={<span className="mono">{p.file}</span>} sub={v.nav.symbols?.[p.file] ? `${v.nav.symbols[p.file].name} · line ${v.nav.symbols[p.file].line}` : undefined} end={<Prob p={p.score} color="var(--blue)" />} />
                      ))}
                    </div>
                  )}
                </Card>
              </motion.div>
            )}
            {tab === 'evidence' && (
              <motion.div key="evidence" initial={{ x: 24 }} animate={{ x: 0 }} exit={{ x: -24, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>
                <Card title={`${kept.length} kept of ${v.evidence.length}`} aside={<span className="d-muted">one {name} request screened them all</span>}>
                  {v.evidence.length > 1 && (
                    <div className="d-viz2">
                      <Donut size={140} thick={16} label="sources" data={kinds.map((k, i) => ({ label: k, value: v.evidence.filter((e: Evidence) => e.kind === k).length, color: PALETTE[i % PALETTE.length] }))} />
                      <Scatter h={170} x="relevance" y="directness" points={v.evidence.map((e: Evidence) => ({ label: `${e.label} · ${e.title || e.ref}`, x: e.relevance ?? 0, y: e.directness ?? 0, color: e.kept ? 'var(--green)' : 'var(--dim)', r: e.kept ? 6 : 4 }))} />
                    </div>
                  )}
                  <div className="d-evidence">
                    {v.evidence.slice(0, 16).map((e: Evidence, i: number) => (
                      <EvidenceCard key={e.ref + i} i={i} e={{ ref: `${e.label} · ${e.ref}`, title: e.title || e.ref, kind: e.kind, relevance: e.relevance ?? 0, kept: e.kept, injection: (e.injection ?? 0) >= 0.5, url: e.url }} />
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {!started && !job.error && repo && prefs.askExamples && ready && <Signposts key={repo} title="Not sure where to start? Take a trail." items={starters.ask} onPick={(q) => run(q)} color="var(--blue)" />}
        </div>
        <aside className="desk-rail">
          <Logbook title="Earlier questions" entries={log} empty={`Your questions about this repository are logged here${prefs.autoSave ? '' : ' when you save them'}.`} />
        </aside>
      </div>
    </div>
  )
}
