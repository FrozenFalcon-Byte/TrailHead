import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { usePrefs } from '../../lib/prefs'
import { useDash } from '../context'
import { EASE, Empty, Gate, Loading, Note, PageHead, q, RefreshButton, useFetch } from '../ui'

/* The decision log as a logbook. Decisions are grouped into the engine calls they came from, so each entry
   reads as one thing that happened ("screened 13 passages for a question") rather than a row per probability.
   Each entry carries a strip of ticks, one per question, tall when sure and coloured by what code did with the
   answer. Picking an entry opens it in the inspector beside the log, question by question. */

type Decision = { id: number; call_id: string; ts: number; purpose: string; engine: string; model_id: string; provider: string; question_id: string; question_type: string; answer: string; probabilities: string; confidence: number | null; action: string; latency_ms: number; input_tokens: number; cached: number }
type Call = { id: string; ts: number; purpose: string; engine: string; model: string; cached: boolean; latency: number; tokens: number; items: Decision[] }
type Outcome = 'go' | 'stop' | 'plain'

const VERB: [string, string, string][] = [
  ['retrieve:filter', 'Screened passages', 'Is each passage on topic, and is any of it trying to steer the model?'],
  ['answer:verify', 'Checked claims', 'Does the cited passage support each drafted claim, and does it answer the question?'],
  ['answer:output_check', 'Checked the final answer', 'Does the written answer stay within what was verified?'],
  ['navigate:expand', 'Chose branches', 'Which folders and files could hold what was described?'],
  ['navigate:symbol', 'Picked a function', 'Which definition in the file matches the description?'],
  ['annotate:issue', 'Graded issues', 'How approachable is each open issue for a newcomer?'],
  ['route', 'Routed a question', 'What kind of question is this, and where should the answer come from?'],
  ['tour', 'Planned a tour', 'Which files belong on the walk, and in what order?'],
]
const verb = (purpose: string) => VERB.find(([p]) => purpose.startsWith(p)) ?? [purpose, purpose.replace(/[:_]/g, ' '), '']
const FILTERS = [['all', 'Everything'], ['retrieve', 'Screening'], ['answer', 'Checking'], ['navigate', 'Finding'], ['annotate', 'Grading']] as const

function outcome(d: Decision): Outcome {
  const a = d.action.toLowerCase()
  if (/dropped|screened out|not relevant|background|rejected|unsupported|insufficient/.test(a)) return 'stop'
  if (/kept|verified|answers|passed|expand|chosen|picked|supports/.test(a)) return 'go'
  return 'plain'
}

/** How strongly the engine leaned: the yes probability for yes/no questions, the top option otherwise. */
function lean(d: Decision): { p: number; options: [string, number][] } {
  let probs: Record<string, number> = {}
  try {
    probs = JSON.parse(d.probabilities)
  } catch {
    /* not JSON */
  }
  const options = Object.entries(probs).sort((a, b) => b[1] - a[1])
  if (d.question_type === 'noul') {
    const yes = probs.yes ?? Number(d.answer) ?? 0
    return { p: yes, options: [['yes', yes], ['no', 1 - yes]] }
  }
  return { p: d.confidence ?? options[0]?.[1] ?? 0, options }
}

function dayLabel(ts: number) {
  const d = new Date(ts * 1000)
  const today = new Date()
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000)
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
}

function Strip({ items, big = false }: { items: Decision[]; big?: boolean }) {
  return (
    <span className={`lg-strip ${big ? 'is-big' : ''}`} aria-hidden>
      {items.slice(0, big ? 80 : 40).map((d, i) => {
        const { p } = lean(d)
        const sure = Math.abs(p - 0.5) * 2
        return <motion.i key={d.id} className={`is-${outcome(d)}`} initial={{ scaleY: 0 }} animate={{ scaleY: 0.25 + 0.75 * sure }} transition={{ type: 'spring', stiffness: 300, damping: 20, delay: Math.min(i, 30) * 0.012 }} />
      })}
      {items.length > (big ? 80 : 40) && <small>+{items.length - (big ? 80 : 40)}</small>}
    </span>
  )
}

function Inspector({ call, when }: { call: Call; when: (ts: number) => string }) {
  const [, title, ask] = verb(call.purpose)
  const counts = { go: 0, stop: 0, plain: 0 }
  call.items.forEach((d) => counts[outcome(d)]++)
  return (
    <motion.section
      key={call.id}
      className="lg-insp"
      initial={{ clipPath: 'inset(0 0 100% 0 round 24px)' }}
      animate={{ clipPath: 'inset(0 0 0% 0 round 24px)' }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <header className="lg-insp__head">
        <span className="lg-insp__kicker mono">{call.purpose}</span>
        <h2>{title}</h2>
        {ask && <p>{ask}</p>}
        <p className="lg-insp__sum">
          {call.items.length} question{call.items.length === 1 ? '' : 's'} in one {call.cached ? 'cached ' : ''}request
          {counts.go + counts.stop > 0 && <> · {counts.go} let through, {counts.stop} turned back</>}
        </p>
        <Strip items={call.items} big />
      </header>
      <ol className="lg-qs">
        {call.items.map((d, i) => {
          const { p, options } = lean(d)
          const o = outcome(d)
          return (
            <motion.li key={d.id} className={`lg-q is-${o}`} initial={{ x: 16 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 28, delay: Math.min(i, 14) * 0.025 }}>
              <span className="lg-q__id mono">{d.question_id}</span>
              <span className="lg-q__bar" title={options.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(', ')}>
                {options.slice(0, 4).map(([k, v], j) => (
                  <motion.span key={k} className={`is-${j}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: Math.max(v, 0.001) }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 + Math.min(i, 14) * 0.025 }}>
                    {v >= 0.18 && <em>{k}</em>}
                  </motion.span>
                ))}
              </span>
              <b className="lg-q__p mono">{Math.round(p * 100)}</b>
              {d.action && <span className="lg-q__act">{d.action}</span>}
            </motion.li>
          )
        })}
      </ol>
      <footer className="lg-insp__foot mono">
        {when(call.ts)} · {call.model} · {call.cached ? 'from the cache' : `${(call.latency / 1000).toFixed(1)}s, ${call.tokens.toLocaleString()} tokens in`}
      </footer>
    </motion.section>
  )
}

export default function Decisions() {
  const { repo } = useDash()
  const prefs = usePrefs()
  const [limit, setLimit] = useState(300)
  const [kind, setKind] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const { data, error, loading, reloading, reload } = useFetch<Decision[]>(repo ? `/api/decisions?limit=${limit}&${q(repo)}` : null)
  const when = (ts: number) => new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: prefs.timeFormat === '12h' })
  const time = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: prefs.timeFormat === '12h' })

  const calls = useMemo(() => {
    const by = new Map<string, Call>()
    for (const d of data ?? []) {
      const c = by.get(d.call_id) ?? { id: d.call_id, ts: d.ts, purpose: d.purpose, engine: d.engine, model: d.model_id.split(':').slice(0, 2).join(':'), cached: !!d.cached, latency: d.latency_ms, tokens: d.input_tokens, items: [] }
      c.items.push(d)
      c.ts = Math.max(c.ts, d.ts)
      by.set(d.call_id, c)
    }
    return [...by.values()].sort((a, b) => b.ts - a.ts)
  }, [data])
  const shown = calls.filter((c) => (kind === 'all' || c.purpose.startsWith(kind)) && (!search || `${c.purpose} ${verb(c.purpose)[1]} ${c.items.map((d) => `${d.question_id} ${d.action}`).join(' ')}`.toLowerCase().includes(search.toLowerCase())))
  const current = shown.find((c) => c.id === picked) ?? shown[0]
  useEffect(() => {
    if (picked && !shown.some((c) => c.id === picked)) setPicked(null)
  }, [kind, search])

  // keyboard: j/k walk the log, like a mail client
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
      if (e.key !== 'j' && e.key !== 'k') return
      const at = shown.findIndex((c) => c.id === current?.id)
      const next = shown[Math.max(0, Math.min(shown.length - 1, at + (e.key === 'j' ? 1 : -1)))]
      if (next) setPicked(next.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, current])

  const total = data?.length ?? 0
  const cachedShare = total ? Math.round(((data ?? []).filter((d) => d.cached).length / total) * 100) : 0
  let lastDay = ''

  return (
    <div className="d-body">
      <PageHead theme="lilac" kicker="Audit log" title="Every" oblique="decision" note="What the engine was asked, how sure it was, and what the code did with each answer." actions={<RefreshButton busy={reloading} onClick={reload} />} />
      <Gate />
      {error && <Note tone="error">{error}</Note>}
      {loading && !data && <Loading label="Opening the log book" hints={['Grouping answers by request', 'Reading what code did with each']} />}
      {data && (
        <>
          <p className="lg-lede">
            {total ? <>The latest <b>{total.toLocaleString()}</b> decisions came from <b>{calls.length}</b> requests{cachedShare ? <>, and <b>{cachedShare}%</b> were answered from the cache without asking again</> : null}. Pick an entry to see each question it asked.</> : 'Nothing has been decided yet.'}
          </p>
          <div className="lg-tools">
            <LayoutGroup id="lg-kind">
              <div className="lg-kinds" role="tablist" aria-label="Kind of decision">
                {FILTERS.map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>
                    {kind === k && <motion.span layoutId="lg-kind-ink" className="lg-kinds__ink" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
            <input className="field lg-search" placeholder="Search questions and actions" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search decisions" />
          </div>
          {shown.length === 0 ? (
            <Empty title={total ? 'Nothing matches' : 'No decisions yet'}>{total ? 'Try another kind or search.' : 'Ask a question, find a file or plan a tour, and every judgement lands here.'}</Empty>
          ) : (
            <div className="lg">
              <ol className="lg-log" aria-label="Requests, newest first">
                {shown.map((c, i) => {
                  const day = dayLabel(c.ts)
                  const head = day !== lastDay
                  lastDay = day
                  const on = current?.id === c.id
                  const [, title] = verb(c.purpose)
                  return (
                    <li key={c.id}>
                      {head && <span className="lg-day">{day}</span>}
                      <motion.button
                        className={`lg-entry ${on ? 'is-on' : ''}`}
                        onClick={() => setPicked(c.id)}
                        aria-pressed={on}
                        initial={{ x: -12 }}
                        animate={{ x: 0 }}
                        transition={{ type: 'spring', stiffness: 360, damping: 30, delay: Math.min(i, 12) * 0.02 }}
                        whileTap={{ scale: 0.985 }}
                      >
                        <span className="lg-entry__time mono">{time(c.ts)}</span>
                        <span className="lg-entry__dot" aria-hidden>{on && <motion.i layoutId="lg-dot" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}</span>
                        <span className="lg-entry__body">
                          <b>{title}</b>
                          <span className="lg-entry__meta">
                            {c.items.length} question{c.items.length === 1 ? '' : 's'} · {c.engine}{c.cached ? ' · cached' : ''}
                          </span>
                          <Strip items={c.items} />
                        </span>
                      </motion.button>
                    </li>
                  )
                })}
                {total >= limit && (
                  <li><button className="d-chip lg-more" onClick={() => setLimit(limit + 300)}>Load older entries</button></li>
                )}
              </ol>
              <div className="lg-side">
                <AnimatePresence mode="wait" initial={false}>
                  {current && <Inspector key={current.id} call={current} when={when} />}
                </AnimatePresence>
                <p className="lg-keys"><kbd>j</kbd> <kbd>k</kbd> walk the log · <span className="lg-key is-go" /> let through · <span className="lg-key is-stop" /> turned back · taller ticks mean surer</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
