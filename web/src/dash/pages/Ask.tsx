import { AnimatePresence, motion } from 'motion/react'
import { TypedField } from '../../motion/TypedField'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Donut, Flow, PALETTE, Scatter, TrailLoop } from '../viz'
import { deleteItem, listSaved, saveItem, type Saved } from '../../lib/history'
import { usePrefs } from '../../lib/prefs'
import { openQr, shareUrl } from '../../lib/qr'
import { errorText, notify, toast } from '../../lib/toast'
import { BeamColumns } from '../../motion/BeamColumns'
import { EvidenceCard } from '../../motion/EvidenceCard'
import { useDash } from '../context'
import { AnswerSheet } from '../AnswerSheet'
import { ago, Card, EASE, Empty, Gate, JobStatus, Note, PageHead, Prob, Row, Split, toBeamSteps, useJob } from '../ui'

type Evidence = { ref: string; kind: string; title: string; url: string; label: string; relevance: number | null; directness: number | null; injection: number | null; kept: boolean; reason: string; source: string }
type Claim = { id: string; text: string; evidence: string[]; p_support: number; directness: number; addresses: number; status: string; badge: string; reason: string }
type AnswerData = { status: string; text: string; confidence: number | null; abstain_reason: string; render: string; claims: Claim[]; evidence: Evidence[] }
export type AskResult = {
  question: string; engine: string; route: string; route_reason: string; route_probabilities: Record<string, number>
  navigation?: { steps: any[]; paths: { nodes: string[]; score: number; file: string }[]; symbols: Record<string, { name: string; line: number }>; requests: number; separation_ratio: number | null }
  retrieval?: { evidence: Evidence[]; requests: number }
  answer: AnswerData
}

const EXAMPLES = [
  'Where are failed requests retried?',
  'How does the scheduler decide which request goes next?',
  'Why does the HTTP cache middleware store responses on disk?',
  'What breaks if I change how Request.meta is copied?',
  'How do I run the test suite?',
]
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
    toast({ tone: 'job', title: done.answer?.status === 'answered' ? 'Answer ready' : 'Abstained — not enough evidence', body: text.trim() })
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
  const aside = (
    <>
      {prefs.askExamples && (
        <Card title="Try one" delay={0.1}>
          <div className="d-list">
            {EXAMPLES.map((ex, i) => <Row key={ex} i={i} onClick={() => run(ex)} lead={<span className="d-li__dir">?</span>} title={ex} />)}
          </div>
        </Card>
      )}
      <Card title="Earlier questions" delay={0.15} aside={<span className="d-muted">{history.length}</span>}>
        {history.length === 0 ? (
          <p className="d-muted">Your questions for this repository are kept here{prefs.autoSave ? '' : ' when you save them'}.</p>
        ) : (
          <div className="d-list d-list--scroll">
            {history.map((h, i) => (
              <div key={h.id} className="d-li-wrap">
                <Row i={i} active={params.get('saved') === h.id} onClick={() => { setQuestion(h.payload.question); job.reset(h.payload); setParams({ saved: h.id }) }} lead={<span className={`d-dot ${h.payload.answer?.status === 'answered' ? 'is-ok' : 'is-warn'}`} />} title={h.title} sub={`${h.payload.answer?.status ?? '—'} · ${ago(h.created_at)}`} />
                <button className="d-li__x" onClick={() => remove(h.id)} aria-label="Remove from history" data-cursor="Remove">×</button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="How it answers" theme="sky" delay={0.2}>
        <Flow steps={ASK_STEPS} at={at} running={job.running} color="var(--blue)" />
      </Card>
    </>
  )


  return (
    <div className="d-body">
      <PageHead theme="sky" kicker="Ask the codebase" title="Ask it" oblique="straight" note="Cited answers, or an honest “not sure”.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask">
          <TypedField value={question} onValue={setQuestion} suggestions={EXAMPLES} maxLength={500} aria-label="Question" />
          <button className="btn" type="submit" disabled={job.running || !repo || question.trim().length < 3}>
            <span>{job.running ? 'Walking…' : 'Ask'}</span><span className="arrow">→</span>
          </button>
        </form>
      </PageHead>
      <Gate />
      <Split aside={aside}>
        <JobStatus running={job.running} stage={stage} elapsed={job.elapsed} onCancel={job.cancel} />
        {job.running && <Card className="d-live"><Flow steps={ASK_STEPS} at={at} running color="var(--blue)" /></Card>}
        {job.error && <Note tone="error">{job.error}</Note>}

        <AnimatePresence>
          {v.route && (
            <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ ease: EASE }} className="d-route">
              <span className="d-route__stub"><small>route</small><b>{ROUTE_NAMES[v.route.route] ?? v.route.route}</b></span>
              <span className="d-route__why">{v.route.reason}</span>
              <span className="d-route__probs">
                {Object.entries<number>(v.route.probabilities ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => (
                  <span key={k}><Prob p={p as number} size={30} color={k === v.route.route ? 'var(--blue)' : 'var(--dim)'} /><i>{ROUTE_NAMES[k] ?? k}</i></span>
                ))}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {(answer || v.steps.length > 0 || v.evidence.length > 0) && (
          <div className="d-tabs" role="tablist">
            {([['answer', 'Answer'], ['beam', `Beam${v.nav?.requests ? ` · ${v.nav.requests}` : ''}`], ['evidence', `Evidence · ${kept.length}/${v.evidence.length}`]] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>
                {tab === k && <motion.span layoutId="ask-tab" className="d-tabs__pill" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
                <span>{label}</span>
              </button>
            ))}
            {result && (
              <span className="d-tabs__end">
                {!prefs.autoSave && <button className="d-chip" onClick={save} data-cursor="Save to history">Save</button>}
                <button className="d-chip" onClick={share} data-cursor="Share as link and QR">Share ▣</button>
              </span>
            )}
          </div>
        )}

        <AnimatePresence mode="wait">
          {tab === 'answer' && answer && (
            <motion.div key="answer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
              <AnswerSheet answer={answer} kicker={ROUTE_NAMES[v.route?.route] ? `Route · ${ROUTE_NAMES[v.route.route]}` : undefined} title={result?.question ?? question} />
            </motion.div>
          )}
          {tab === 'beam' && (
            <motion.div key="beam" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
              <Card title="The beam, depth by depth" aside={v.nav && <span className="d-muted">{v.nav.requests} Jev request{v.nav.requests === 1 ? '' : 's'}{v.nav.separation_ratio ? ` · separation ${v.nav.separation_ratio.toFixed(2)}` : ''}</span>}>
                {v.steps.length ? <BeamColumns steps={toBeamSteps(v.steps)} compact /> : <p className="d-muted">This route did not need to walk the tree.</p>}
                {v.nav?.paths?.length > 0 && (
                  <div className="d-list" style={{ marginTop: 14 }}>
                    {v.nav.paths.map((p: { file: string; score: number }, i: number) => (
                      <Row key={p.file} i={i} to={`/app/map?file=${encodeURIComponent(p.file)}`} path={p.file} lead={<span className="d-score">{i + 1}</span>} title={<span className="mono">{p.file}</span>} sub={v.nav.symbols?.[p.file] ? `${v.nav.symbols[p.file].name} · line ${v.nav.symbols[p.file].line}` : undefined} end={<Prob p={p.score} color="var(--blue)" width={50} />} />
                    ))}
                  </div>
                )}
              </Card>
            </motion.div>
          )}
          {tab === 'evidence' && (
            <motion.div key="evidence" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
              <Card title={`${kept.length} kept of ${v.evidence.length}`} aside={<span className="d-muted">one Jev request screened them all</span>}>
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

        {!job.running && !answer && !job.error && repo && (
          <Card>
            <div className="d-empty-art"><TrailLoop color="var(--blue)" /></div>
            <Empty title="Ask anything about the code">Answers cite pull requests, commits, issues and code. When the evidence is thin, Trailhead says so instead of guessing.</Empty>
          </Card>
        )}
      </Split>
    </div>
  )
}
