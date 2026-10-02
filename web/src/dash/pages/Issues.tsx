import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { Select } from '../../motion/Select'
import { TrailLoader } from '../../motion/TrailLoader'
import { useDash } from '../context'
import { Gate, Note, PageHead, Prob, q, RefreshButton, useJob } from '../ui'

/* First issues. Opening the page shows what is already judged straight away (from this browser's copy, then the
   server's), and quietly asks Jev to judge the next few unranked issues. Each one drops into place as it is
   judged; the judgements are stored on the server, so nothing is ever judged twice. */

type Pick = { number: number; title: string; url: string; labels: string[]; score: number; parts: Record<string, number>; kind: string; engine: string }
type IssuesData = { weights: Record<string, number>; picks: Pick[]; open_unlinked: number; annotated: number; unranked: number }
type Queued = { number: number; title: string; state: 'wait' | 'reading' | 'done' | 'failed' }

const PART_LABEL: Record<string, string> = { scope_clarity: 'Clear scope', prior_knowledge_needed: 'Little prior knowledge', has_acceptance_criteria: 'Says when it is done', touches_single_area: 'One area of code' }
const BATCH = 8
const ENOUGH = 30

const GRADES = [
  { key: 'easy', at: 0.7, label: 'Easy stroll', note: 'Clear, small, self-contained', color: 'var(--green)' },
  { key: 'moderate', at: 0.45, label: 'Moderate hike', note: 'Some reading first', color: 'var(--blue)' },
  { key: 'steep', at: 0, label: 'Steep climb', note: 'Needs context or is open-ended', color: 'var(--solid)' },
] as const
const gradeOf = (score: number) => GRADES.find((g) => score >= g.at) ?? GRADES[2]

const cacheKey = (repo: string) => `th-issues:${repo}`
function readCache(repo: string): IssuesData | null {
  try {
    const raw = localStorage.getItem(cacheKey(repo))
    return raw ? (JSON.parse(raw) as IssuesData) : null
  } catch {
    return null
  }
}
function writeCache(repo: string, data: IssuesData) {
  try {
    localStorage.setItem(cacheKey(repo), JSON.stringify(data))
  } catch {
    /* storage full or blocked: the server copy still holds everything */
  }
}

/** A trail difficulty sign: circle for easy, square for moderate, diamond for steep. */
function GradeSign({ score, size = 30 }: { score: number; size?: number }) {
  const g = gradeOf(score)
  return (
    <span className={`fi-sign is-${g.key}`} style={{ width: size, height: size }} title={g.label} aria-label={g.label}>
      <svg viewBox="0 0 30 30" width={size} height={size} aria-hidden>
        {g.key === 'easy' && <circle cx={15} cy={15} r={11} />}
        {g.key === 'moderate' && <rect x={4.5} y={4.5} width={21} height={21} rx={3} />}
        {g.key === 'steep' && <path d="M15 2.5 L27.5 15 L15 27.5 L2.5 15 Z" />}
      </svg>
    </span>
  )
}

function Parts({ p }: { p: Pick }) {
  return (
    <ul className="fi-parts">
      {Object.entries(p.parts).map(([k, v], i) => {
        const good = k === 'prior_knowledge_needed' ? 1 - v : v
        return (
          <li key={k}>
            <span>{PART_LABEL[k] ?? k}</span>
            <span className="fi-parts__bar"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.03, good) }} transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.05 + i * 0.05 }} /></span>
            <b className="mono">{Math.round(good * 100)}</b>
          </li>
        )
      })}
    </ul>
  )
}

export default function Issues() {
  const { repo, engine, offline } = useDash()
  const navigate = useNavigate()
  const [data, setData] = useState<IssuesData | null>(() => (repo ? readCache(repo) : null))
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(false)
  const [queue, setQueue] = useState<Queued[]>([])
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState('score')
  const [kind, setKind] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const job = useJob<IssuesData>('/api/issues/rank')
  const asked = useRef('')

  const save = (d: IssuesData) => {
    setData(d)
    if (repo) writeCache(repo, d)
  }

  const rank = async () => {
    if (!repo || job.running) return
    setQueue([])
    await job.start({ repo, engine, limit: BATCH }, (k, d) => {
      if (k === 'plan') setQueue(d.todo.map((t: { number: number; title: string }) => ({ ...t, state: 'wait' })))
      if (k === 'reading') setQueue((qs) => qs.map((x) => (x.number === d.number ? { ...x, state: 'reading' } : x)))
      if (k === 'ranked') {
        setQueue((qs) => qs.map((x) => (x.number === d.number ? { ...x, state: d.pick ? 'done' : 'failed' } : x)))
        if (d.pick) setData((cur) => (cur ? { ...cur, picks: [...cur.picks.filter((p) => p.number !== d.number), d.pick].sort((a, b) => b.score - a.score), annotated: cur.annotated + 1, unranked: Math.max(0, cur.unranked - 1) } : cur))
      }
      if (k === 'done') save(d)
    })
  }

  const load = async () => {
    if (!repo) return
    setFetching(true)
    setError('')
    try {
      const fresh = await api<IssuesData>(`/api/issues?${q(repo)}`)
      save(fresh)
      return fresh
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  // On arrival: paint the cached copy, fetch the server's, then judge the next batch if the list is still short.
  useEffect(() => {
    if (!repo || offline) return
    setData(readCache(repo))
    load().then((fresh) => {
      if (fresh && asked.current !== repo && fresh.unranked > 0 && fresh.picks.length < ENOUGH) {
        asked.current = repo
        rank()
      }
    })
  }, [repo, offline])

  const kinds = useMemo(() => [...new Set((data?.picks ?? []).map((p) => p.kind).filter(Boolean))], [data])
  const picks = useMemo(() => {
    const rows = (data?.picks ?? []).filter((p) => (kind === 'all' || p.kind === kind) && (!filter || `#${p.number} ${p.title} ${p.labels.join(' ')}`.toLowerCase().includes(filter.toLowerCase())))
    return [...rows].sort((a, b) => (sort === 'score' ? b.score - a.score : sort === 'newest' ? b.number - a.number : a.number - b.number))
  }, [data, filter, sort, kind])
  const top = sort === 'score' && !filter && kind === 'all' ? picks[0] : undefined
  const rest = top ? picks.slice(1) : picks
  const reading = queue.find((x) => x.state === 'reading')
  const nothingYet = !data?.picks.length

  return (
    <div className="d-body">
      <PageHead theme="butter" kicker="Good first issues" title="Start" oblique="small" note="Open issues nobody has fixed yet, graded like trails by how gentle a first contribution they make." actions={<RefreshButton busy={fetching} onClick={() => load()} />} />
      <Gate />
      {error && <Note tone="error">{error}</Note>}
      {job.error && <Note tone="error">Could not judge more issues: {job.error}</Note>}

      <AnimatePresence initial={false}>
        {job.running && !nothingYet && (
          <motion.section key="crew" className="fi-crew" initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 28 }}>
            <div className="fi-crew__in">
              <TrailLoader compact label={reading ? `Reading #${reading.number}` : 'Picking the next issues'} />
              <div className="fi-crew__copy">
                <b>Grading new trails</b>
                <span>Jev reads each unranked issue once; it lands in the list as soon as it is graded.</span>
                <ol className="fi-queue">
                  {queue.map((x) => (
                    <li key={x.number} className={`is-${x.state}`}>
                      <i aria-hidden>{x.state === 'done' ? '✓' : x.state === 'failed' ? '×' : ''}</i>
                      <span className="mono">#{x.number}</span> {x.title}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {nothingYet && (job.running || fetching || !data) ? (
        <div className="fi-wait">
          <TrailLoader label={reading ? `Reading #${reading.number}: ${reading.title}` : 'Scouting the open issues'} hints={['Grading each trail by how gentle it is', 'The first ones appear in a minute or so', 'Graded issues are kept, so this only happens once']} />
          {queue.length > 0 && (
            <ol className="fi-queue is-center">
              {queue.map((x) => <li key={x.number} className={`is-${x.state}`}><i aria-hidden>{x.state === 'done' ? '✓' : ''}</i><span className="mono">#{x.number}</span> {x.title}</li>)}
            </ol>
          )}
        </div>
      ) : data && (
        <div className="fi">
          <div className="fi-main">
            <div className="d-toolbar">
              <input className="field d-toolbar__search" placeholder="Filter by title, number or label" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter issues" />
              <Select label="Kind" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Every kind' }, ...kinds.map((k) => ({ value: k, label: k }))]} />
              <Select label="Sort" value={sort} onChange={setSort} align="end" options={[{ value: 'score', label: 'Gentlest first' }, { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
            </div>

            {nothingYet && <Note>No open issues left to grade{job.error ? ' right now' : ''}. Try Refresh in a bit.</Note>}
            {!nothingYet && picks.length === 0 && <Note>Nothing matches that filter.</Note>}

            <LayoutGroup>
              {top && (
                <motion.article layout key={`top-${top.number}`} className="fi-top" initial={{ y: 16, rotate: -0.6 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }}>
                  <div className="fi-top__stub" style={{ ['--g' as string]: gradeOf(top.score).color }}>
                    <GradeSign score={top.score} size={44} />
                    <b>{gradeOf(top.score).label}</b>
                    <Prob p={top.score} size={58} color={gradeOf(top.score).color === 'var(--solid)' ? 'var(--orange)' : gradeOf(top.score).color} />
                    <small>gentle</small>
                  </div>
                  <div className="fi-top__body">
                    <span className="fi-label">Best first trail</span>
                    <h2><span className="fi-num mono">#{top.number}</span> {top.title}</h2>
                    <div className="fi-tags">
                      {top.kind && <span className="d-tag">{top.kind}</span>}
                      {top.labels.slice(0, 4).map((l) => <span key={l} className="d-tag is-soft">{l}</span>)}
                    </div>
                    <Parts p={top} />
                    <div className="fi-actions">
                      <button className="btn small" onClick={() => navigate(`/app/tour?q=${encodeURIComponent(`Fix issue #${top.number}: ${top.title}`)}`)}><span>Plan a tour for it</span><span className="arrow">→</span></button>
                      <button className="d-chip" onClick={() => navigate(`/app/ask?q=${encodeURIComponent(`Where would I start fixing: ${top.title}?`)}`)}>Ask where to start</button>
                      <a className="d-chip" href={top.url} target="_blank" rel="noreferrer noopener">Open on GitHub ↗</a>
                    </div>
                  </div>
                </motion.article>
              )}

              <div className="fi-grid">
                {rest.map((p, i) => {
                  const g = gradeOf(p.score)
                  const isOpen = open === p.number
                  return (
                    <motion.article layout key={p.number} className={`fi-card ${isOpen ? 'is-open' : ''}`} style={{ ['--g' as string]: g.color }} initial={{ y: 18, scale: 0.97 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay: Math.min(i, 8) * 0.025 }}>
                      <button className="fi-card__head" onClick={() => setOpen(isOpen ? null : p.number)} aria-expanded={isOpen} data-cursor={isOpen ? 'Collapse' : 'Show the breakdown'}>
                        <GradeSign score={p.score} />
                        <span className="fi-card__text">
                          <b><span className="fi-num mono">#{p.number}</span> {p.title}</b>
                          <small>{g.label}{p.kind ? ` · ${p.kind}` : ''}{p.labels.includes('good first issue') ? ' · marked good first issue' : ''}</small>
                        </span>
                        <Prob p={p.score} size={36} color={g.color === 'var(--solid)' ? 'var(--orange)' : g.color} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div className="fi-card__more" initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
                            <div className="fi-card__pad">
                              <Parts p={p} />
                              <div className="fi-actions">
                                <button className="d-chip" onClick={() => navigate(`/app/tour?q=${encodeURIComponent(`Fix issue #${p.number}: ${p.title}`)}`)}>Plan a tour →</button>
                                <button className="d-chip" onClick={() => navigate(`/app/ask?q=${encodeURIComponent(`Where would I start fixing: ${p.title}?`)}`)}>Ask where to start</button>
                                <a className="d-chip" href={p.url} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.article>
                  )
                })}
              </div>
            </LayoutGroup>
          </div>

          <aside className="fi-rail">
            <section className="fi-legend">
              <b className="fi-rail__title">Trail grades</b>
              <ul>
                {GRADES.map((g) => (
                  <li key={g.key}>
                    <GradeSign score={g.at === 0 ? 0.1 : g.at + 0.01} size={26} />
                    <span><b>{g.label}</b><small>{g.note}</small></span>
                    <span className="fi-legend__n mono">{data.picks.filter((p) => gradeOf(p.score).key === g.key).length}</span>
                  </li>
                ))}
              </ul>
              <p className="fi-rail__note">
                Graded on {Object.entries(data.weights).map(([k, w], i, all) => <span key={k}>{(PART_LABEL[k] ?? k).toLowerCase()} ({Math.round(w * 100)}%){i < all.length - 2 ? ', ' : i === all.length - 2 ? ' and ' : ''}</span>)}.
              </p>
            </section>
            <section className="fi-status">
              <p>
                {data.annotated} of {data.open_unlinked} open issues graded.{' '}
                {data.unranked > 0 ? (job.running ? 'More are being graded now.' : 'More get graded a few at a time as you visit.') : 'Every open issue is graded.'}
              </p>
              {data.unranked > 0 && !job.running && <button className="d-chip" onClick={rank}>Grade {Math.min(BATCH, data.unranked)} more →</button>}
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
