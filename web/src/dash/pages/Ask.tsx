import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listSaved, saveItem, type Saved } from '../../lib/history'
import { BeamColumns } from '../../motion/BeamColumns'
import { EvidenceCard } from '../../motion/EvidenceCard'
import { useDash } from '../context'
import { ago, CalibBadge, Card, EASE, Empty, Gate, JobStatus, Note, PageHead, Prob, Prose, toBeamSteps, useJob } from '../ui'

type Evidence = { ref: string; kind: string; title: string; url: string; label: string; relevance: number | null; directness: number | null; injection: number | null; kept: boolean; reason: string; source: string }
type Claim = { id: string; text: string; evidence: string[]; p_support: number; directness: number; addresses: number; status: string; badge: string; reason: string }
type AnswerData = { status: string; text: string; confidence: number | null; abstain_reason: string; render: string; claims: Claim[]; evidence: Evidence[] }
type AskResult = {
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

function view(result: AskResult | null, events: { kind: string; data: any }[]): { route: any; steps: any[]; nav: any; evidence: Evidence[]; answer: AnswerData | undefined } {
  if (result)
    return { route: { route: result.route, reason: result.route_reason, probabilities: result.route_probabilities }, steps: result.navigation?.steps ?? [], nav: result.navigation, evidence: result.retrieval?.evidence ?? [], answer: result.answer }
  const last = (k: string) => [...events].reverse().find((e) => e.kind === k)?.data
  return { route: last('route'), steps: last('navigation')?.steps ?? events.filter((e) => e.kind === 'nav_depth').flatMap((e) => e.data.steps), nav: last('navigation'), evidence: last('evidence')?.evidence ?? [], answer: last('answer') as AnswerData | undefined }
}

export default function Ask() {
  const { repo, engine } = useDash()
  const job = useJob<AskResult>('/api/ask')
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Saved<AskResult>[]>([])
  const [saveError, setSaveError] = useState('')
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (!repo) return
    listSaved<AskResult>('asks', repo).then((rows) => {
      setHistory(rows)
      const want = params.get('saved')
      const hit = want && rows.find((r) => r.id === want)
      if (hit) {
        setQuestion(hit.payload.question)
        job.reset(hit.payload)
      }
    }).catch(() => setHistory([]))
  }, [repo])

  const run = async (text = question) => {
    if (text.trim().length < 3 || !repo) return
    setQuestion(text)
    setSaveError('')
    setParams({})
    let final: AskResult | null = null
    await job.start({ question: text.trim(), repo, engine }, (kind, data) => {
      if (kind === 'done') final = data
    })
    if (final) {
      try {
        const row = await saveItem('asks', repo, text.trim(), final as AskResult)
        setHistory((h) => [row, ...h])
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const v = useMemo(() => view(job.result, job.events), [job.result, job.events])
  const stage = !v.route ? 'Routing the question and reading the top of the tree' : !v.nav && v.steps.length ? 'Beam search is walking the tree' : !v.evidence.length ? 'Gathering history and code' : !v.answer ? 'Drafting claims and checking each one against its evidence' : 'Done'
  const kept = v.evidence.filter((e: Evidence) => e.kept)
  const answer = v.answer

  return (
    <>
      <PageHead theme="sky" kicker="Ask the codebase" title="Ask it" oblique="straight" note="Jev routes the question, walks the tree, screens every passage and checks every claim.">
        <form onSubmit={(e) => { e.preventDefault(); run() }} className="d-ask" style={{ marginTop: 26, maxWidth: 980 }}>
          <input className="field" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Where are failed requests retried?" maxLength={500} aria-label="Question" />
          <button className="btn" type="submit" disabled={job.running || !repo || question.trim().length < 3}>
            <span>{job.running ? 'Walking…' : 'Ask'}</span><span className="arrow">→</span>
          </button>
        </form>
        <div className="d-row" style={{ marginTop: 14 }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="d-chip" disabled={job.running} onClick={() => run(ex)} style={{ background: 'color-mix(in srgb, var(--blue) 16%, transparent)', color: 'var(--blue)' }}>{ex}</button>
          ))}
        </div>
      </PageHead>
      <div className="d-body">
        <Gate />
        <JobStatus running={job.running} stage={stage} elapsed={job.elapsed} onCancel={job.cancel} />
        {job.error && <Note tone="error">{job.error}</Note>}
        {saveError && <Note tone="info">Answer shown but not saved: {saveError}</Note>}

        <AnimatePresence>
          {v.route && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="d-row">
              <span className="d-badge" style={{ background: 'var(--sky)', color: 'var(--blue)', fontSize: 16 }}>route · {ROUTE_NAMES[v.route.route] ?? v.route.route}</span>
              <span className="small" style={{ opacity: 0.65 }}>{v.route.reason}</span>
              {Object.entries<number>(v.route.probabilities ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, p]) => (
                <span key={k} className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{ROUTE_NAMES[k] ?? k} <Prob p={p as number} width={50} color="var(--blue)" /></span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {answer && (
          <Card theme={answer.status === 'answered' ? 'cream' : 'peach'} style={{ boxShadow: 'inset 0 0 0 2px var(--ink)' }}>
            <div className="d-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <motion.span className="display" initial={{ scale: 1.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} style={{ fontSize: 30, padding: '2px 12px', borderRadius: 8, boxShadow: 'inset 0 0 0 3px currentColor', color: answer.status === 'answered' ? 'var(--green)' : 'var(--orange)' }}>
                {answer.status === 'answered' ? 'Answered' : 'Not sure — abstained'}
              </motion.span>
              {answer.confidence != null && <span className="small">confidence <Prob p={answer.confidence} /></span>}
            </div>
            <Prose text={answer.text} evidence={answer.evidence} />
            {answer.status === 'abstained' && answer.abstain_reason && <p className="hand" style={{ fontSize: 24, margin: '6px 0 0' }}>why: {answer.abstain_reason}</p>}
            {answer.claims?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="kicker" style={{ fontSize: 18, marginBottom: 4 }}>Claims, as Jev checked them</div>
                {answer.claims.map((c, i) => (
                  <motion.div key={c.id} className="d-claim" initial={{ opacity: 0, x: -12 }} animate={{ opacity: c.status === 'dropped' ? 0.55 : 1, x: 0 }} transition={{ delay: i * 0.06, ease: EASE, duration: 0.5 }}>
                    <CalibBadge badge={c.badge} status={c.status} />
                    <div>
                      <div style={{ fontWeight: 650, textDecoration: c.status === 'dropped' ? 'line-through' : 'none' }}>{c.text}</div>
                      <div className="small" style={{ opacity: 0.6 }}>cites {c.evidence.join(', ')} · {c.reason}</div>
                    </div>
                    <div style={{ display: 'grid', gap: 2, justifyItems: 'end' }} className="small">
                      <span>support <Prob p={c.p_support} width={50} /></span>
                      <span>direct <Prob p={c.directness} width={50} color="var(--blue)" /></span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            <p className="small" style={{ opacity: 0.5, marginTop: 12 }}>Prose: {answer.render === 'llm' ? 'written by the LLM from verified claims, then checked' : answer.render === 'claims' ? 'the verified claims themselves (no prose model involved)' : answer.render || 'navigation result'}</p>
          </Card>
        )}

        {(v.steps.length > 0 || v.nav) && (
          <Card title="The beam, depth by depth" theme="sky" aside={v.nav && <span className="small">{v.nav.requests} Jev request{v.nav.requests === 1 ? '' : 's'}{v.nav.separation_ratio ? ` · separation ${v.nav.separation_ratio.toFixed(2)}` : ''}</span>}>
            <BeamColumns steps={toBeamSteps(v.steps)} compact />
            {v.nav?.paths?.length > 0 && (
              <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
                {v.nav.paths.map((p: { file: string; score: number }, i: number) => (
                  <div key={p.file} className="d-row" style={{ fontWeight: i === 0 ? 800 : 550 }}>
                    <span className="mono">{p.file}</span>
                    {v.nav.symbols?.[p.file] && <span className="small" style={{ opacity: 0.7 }}>→ {v.nav.symbols[p.file].name}:{v.nav.symbols[p.file].line}</span>}
                    <span style={{ marginLeft: 'auto' }}><Prob p={p.score} color="var(--blue)" /></span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {v.evidence.length > 0 && (
          <Card title={`Evidence · ${kept.length} kept of ${v.evidence.length}`} aside={<span className="small" style={{ opacity: 0.6 }}>one Jev request screened them all</span>}>
            <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {v.evidence.slice(0, 16).map((e: Evidence, i: number) => (
                <EvidenceCard key={e.ref + i} i={i} e={{ ref: `${e.label} · ${e.ref}`, title: e.title || e.ref, kind: e.kind, relevance: e.relevance ?? 0, kept: e.kept, injection: (e.injection ?? 0) >= 0.5, url: e.url }} />
              ))}
            </div>
          </Card>
        )}

        {!job.running && !answer && !job.error && repo && (
          <Card>
            <Empty title="Ask anything about the code">Answers cite pull requests, commits, issues and code. When the evidence is thin, Trailhead says so instead of guessing.</Empty>
          </Card>
        )}

        {history.length > 0 && (
          <Card title="Earlier questions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {history.map((h) => (
                <button key={h.id} className="d-chip" style={{ justifyContent: 'space-between', borderRadius: 12 }} onClick={() => { setQuestion(h.payload.question); job.reset(h.payload); setParams({ saved: h.id }) }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.title}</span>
                  <span className="small" style={{ opacity: 0.6, flexShrink: 0 }}>{h.payload.answer?.status} · {ago(h.created_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
