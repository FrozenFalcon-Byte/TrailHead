import { AnimatePresence, motion } from 'motion/react'
import { TreeTrail } from '../TreeTrail'
import { TypedField } from '../../motion/TypedField'
import { useStarters } from '../examples'
import { cloneElement, Fragment, isValidElement, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { listSaved, type Saved } from '../../lib/history'
import { clock, overviewCards, usePrefs, type OverviewCard } from '../../lib/prefs'
import { Segmented } from '../../motion/Select'
import { useDash } from '../context'
import { NAV } from '../nav'
import { Shape } from '../../motion/Shapes'
import { byDay, Columns, Donut, Treemap } from '../viz'
import { ago, Card, EASE, Empty, Gate, Loading, Note, PageHead, Prob, q, RefreshButton, Row, useFetch } from '../ui'

type OverviewData = {
  repo: string; head: string; files: number; tests: number; symbols: number; commits: number; pull_requests: number; issues: number
  comments: number; links: number; annotated_files: number; layers: Record<string, number>; top_dirs: { path: string; summary: string }[]
}
type Pick = { number: number; title: string; url: string; score: number; kind: string }
type Decision = { id: number; ts: number; purpose: string; answer: string; confidence: number | null; engine: string; cached: number }

const MODES = [
  { value: 'ask', label: 'Ask', go: 'Ask it' },
  { value: 'tour', label: 'Tour', go: 'Plan a tour' },
  { value: 'find', label: 'Find', go: 'Find the file' },
] as const
type Mode = (typeof MODES)[number]['value']
const LAYER_COLORS = ['var(--violet)', 'var(--orange)', 'var(--green)', 'var(--yellow)', 'var(--blue)', 'var(--lime)', 'var(--stop)', 'var(--dim)']

function Quick() {
  const navigate = useNavigate()
  const { repo } = useDash()
  const [mode, setMode] = useState<Mode>('ask')
  const [text, setText] = useState('')
  const m = MODES.find((x) => x.value === mode)!
  const { starters } = useStarters(repo)
  const go = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim().length < 3) return
    navigate(`/app/${mode}?q=${encodeURIComponent(text.trim())}&run=1`)
  }
  return (
    <form className="d-quick" onSubmit={go}>
      <Segmented value={mode} onChange={setMode} options={MODES.map(({ value, label }) => ({ value, label }))} label="What to do" />
      <div className="d-quick__row">
        <TypedField key={`${mode}:${repo}`} value={text} onValue={setText} suggestions={starters[mode]} aria-label={m.go} maxLength={mode === 'tour' ? 1200 : 500} />
        <button className="btn" type="submit" disabled={!repo || text.trim().length < 3}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={mode} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.22 }}>{m.go}</motion.span>
          </AnimatePresence>
          <span className="arrow">→</span>
        </button>
      </div>
    </form>
  )
}

/** Three ways to start, as big doors rather than a wall of numbers. */
function NextSteps({ open }: { open?: number }) {
  const doors = [
    { item: NAV[1], title: 'Ask a question', line: 'Get a cited answer, or an honest “not sure”.' },
    { item: NAV[2], title: 'Plan a reading tour', line: 'Say what you want to change; get the files in order.' },
    { item: NAV[4], title: 'Pick a first issue', line: open ? `${open} open issues nobody has fixed yet.` : 'Open issues ranked by how gentle they are.' },
  ]
  return (
    <div className="d-doors">
      {doors.map(({ item, title, line }, i) => (
        <motion.div key={item.to} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE, delay: 0.15 + i * 0.07 }}>
          <Link to={item.to} className="d-door" style={{ ['--door' as string]: item.bg, ['--door-ink' as string]: item.color }} data-cursor={`${item.label} →`}>
            <span className="d-door__icon"><Shape kind={item.kind} color={item.color} glyph={item.glyph} size={0} style={{ width: '100%', height: 'auto' }} /></span>
            <span className="d-door__text">
              <b className="chunk">{title}</b>
              <span>{line}</span>
            </span>
            <span className="d-door__go" aria-hidden>→</span>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}

export default function Overview() {
  const { repo, offline, engine, config, nextSlot, health, recheck, checking, lastCheck } = useDash()
  const { displayName, bypass } = useAuth()
  const prefs = usePrefs()
  const { data, error, loading, reloading, reload } = useFetch<OverviewData>(repo ? `/api/overview?${q(repo)}` : null)
  const issues = useFetch<{ picks: Pick[]; open_unlinked: number }>(repo && !offline ? `/api/issues?${q(repo)}` : null)
  const decisions = useFetch<Decision[]>(repo && !offline ? `/api/decisions?limit=400&${q(repo)}` : null)
  const navigate = useNavigate()
  const days = byDay((decisions.data ?? []).map((d) => d.ts), 14)
  const [recent, setRecent] = useState<(Saved<unknown> & { type: string })[]>([])
  useEffect(() => {
    if (!repo) return
    Promise.all([listSaved('asks', repo, 6), listSaved('tours', repo, 6)])
      .then(([a, t]) => setRecent([...a.map((x) => ({ ...x, type: 'ask' })), ...t.map((x) => ({ ...x, type: 'tour' }))].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 6)))
      .catch(() => setRecent([]))
  }, [repo])

  const first = bypass || !prefs.greetByName ? '' : displayName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const layers = data ? Object.entries(data.layers).sort((a, b) => b[1] - a[1]) : []
  const layerTotal = layers.reduce((a, [, n]) => a + n, 0)
  const model = engine === 'jev' ? config?.jev.model_id : engine === 'llm' ? config?.llm.model : config?.local.model
  const refreshing = reloading || checking

  // Each overview card by id, so Settings can hide and reorder them.
  const CARDS: Record<OverviewCard, () => React.ReactNode> = data ? {
    activity: () => (
    <Card key="activity" span={8} title="Activity" aside={<span className="d-muted">Decisions · last 14 days</span>}>
      {decisions.data?.length ? (
        <Columns data={days.map((d) => ({ ...d, hint: `decisions on ${d.label}` }))} color="var(--violet)" h={170} ticks={7} onPick={() => navigate('/app/decisions')} />
      ) : (
        <Empty title="Quiet so far">Ask a question or plan a tour and the days fill in.</Empty>
      )}
    </Card>
    ),
    system: () => (
    <Card key="system" span={4} title="System" className="d-sys" aside={<Link to="/app/settings#engine" className="d-more">Settings →</Link>}>
      <ul className="d-sys__list">
        <li><span>Engine</span><b>{engine === 'jev' ? 'Jev' : engine === 'llm' ? 'LLM fallback' : 'Local'}</b></li>
        <li><span>Model</span><b className="mono" title={model}>{model || '—'}</b></li>
        {engine === 'jev' && <li><span>Jev slot</span><b>{offline ? '—' : nextSlot < 0.5 ? 'ready now' : `in ${Math.ceil(nextSlot)}s`}</b></li>}
        <li><span>Sign-in</span><b>{health?.auth === 'supabase' ? 'Supabase' : health?.auth ?? '—'}</b></li>
        <li><span>Last check</span><b>{lastCheck ? ago(new Date(lastCheck).toISOString()) : '—'}</b></li>
      </ul>
    </Card>
    ),
    layers: () => (
    <Card key="layers" span={6} title="What the files are" aside={<span className="d-muted">{data.annotated_files} annotated</span>}>
      {layerTotal === 0 ? (
        <p className="d-muted">No layer annotations yet. Run <span className="mono">trailhead annotate file</span>.</p>
      ) : (
        <Donut data={layers.map(([k, n], i) => ({ label: k.replace(/_/g, ' '), value: n, color: LAYER_COLORS[i % LAYER_COLORS.length] }))} label="annotated files" />
      )}
    </Card>
    ),
    history: () => (
    <Card key="history" span={6} title="What history holds">
      <Treemap
        h={220}
        items={[
          { label: 'Commits', value: data.commits, color: 'var(--blue)' },
          { label: 'Pull requests', value: data.pull_requests, color: 'var(--violet)' },
          { label: 'Issues', value: data.issues, color: 'var(--yellow)', onClick: () => navigate('/app/issues') },
          { label: 'Comments', value: data.comments, color: 'var(--orange)' },
          { label: 'Cross-links', value: data.links, color: 'var(--green)' },
        ]}
      />
    </Card>
    ),
    tree: () => (
    <Card key="tree" span={6} title="Top of the tree" aside={<Link to="/app/map" className="d-more">Map →</Link>}>
      <TreeTrail dirs={data.top_dirs} repo={data.repo} />
    </Card>
    ),
    recent: () => (
    <Card key="recent" span={6} title="Recent trails">
      {recent.length === 0 ? (
        <p className="d-muted">Nothing saved here yet. Asks and tours you run land in this list.</p>
      ) : (
        <div className="d-list">
          {recent.map((r, i) => (
            <Row key={r.id} i={i} to={`/app/${r.type}?saved=${r.id}`} lead={<span className={`d-tag is-${r.type}`}>{r.type}</span>} title={r.title} sub={ago(r.created_at)} />
          ))}
        </div>
      )}
    </Card>
    ),
    issues: () => (
    <Card key="issues" span={6} title="Gentle first issues" aside={<Link to="/app/issues" className="d-more">All issues →</Link>}>
      {issues.loading && !issues.data ? (
        <Loading label="Sorting issues" />
      ) : issues.data?.picks.length ? (
        <div className="d-list">
          {issues.data.picks.slice(0, 4).map((p, i) => (
            <Row key={p.number} i={i} href={p.url} lead={<span className="d-score">{Math.round(p.score * 100)}</span>} title={`#${p.number} ${p.title}`} sub={p.kind} end={<span className="d-ext">↗</span>} />
          ))}
        </div>
      ) : (
        <Empty title="None ranked yet">Run <span className="mono">bin/trailhead pick --limit 30</span> to rank open issues.</Empty>
      )}
    </Card>
    ),
    decisions: () => (
    <Card key="decisions" span={6} title="Latest decisions" aside={<Link to="/app/decisions" className="d-more">Audit log →</Link>}>
      {decisions.loading && !decisions.data ? (
        <Loading label="Opening the log" />
      ) : decisions.data?.length ? (
        <div className="d-list">
          {decisions.data.slice(0, 6).map((d, i) => (
            <Row key={d.id} i={i} to="/app/decisions" lead={<span className="d-tag">{d.purpose}</span>} title={d.answer} sub={`${d.engine}${d.cached ? ' · cached' : ''} · ${ago(new Date(d.ts * 1000).toISOString())}`} end={d.confidence != null ? <Prob p={d.confidence} width={44} /> : undefined} />
          ))}
        </div>
      ) : (
        <Empty title="No decisions yet">Every judgement made while answering is logged here.</Empty>
      )}
    </Card>
    ),
  } : ({} as Record<OverviewCard, () => React.ReactNode>)
  const shown = overviewCards(prefs).filter((c) => !c.hidden)

  return (
    <div className="d-body">
      <PageHead kicker="Today" title={`${greeting}${first ? `, ${first}` : ''}.`} oblique="Where to?" note={<>{clock(new Date())} · {repo ? <>reading <span className="mono">{repo}</span></> : 'no repository yet'} </>} actions={<RefreshButton busy={refreshing} onClick={() => { recheck(); reload() }} label="Refresh" />}>
        <Quick />
      </PageHead>

      <Gate />
      {error && !offline && <Note tone="error">{error}</Note>}
      {loading && !data && <Loading label="Reading the map" />}

      {data && (
        <>
          <NextSteps open={issues.data?.open_unlinked} />

          <div className={`d-bento is-${prefs.overviewLayout}`}>
            {shown.map((c, i) => <Fragment key={c.id}>{withDelay(CARDS[c.id](), 0.15 + i * 0.04)}</Fragment>)}
          </div>

          <p className="d-foot">
            Snapshot at <span className="mono">{data.head?.slice(0, 10)}</span> · {data.comments.toLocaleString()} comments · {data.links.toLocaleString()} cross-links between issues, pull requests and commits
            {prefs.shortcuts && <> · press <kbd>?</kbd> for shortcuts</>}
          </p>
        </>
      )}
    </div>
  )
}

/** Stagger cards by their place in the person's order rather than their place in the code. */
function withDelay(node: React.ReactNode, delay: number) {
  return isValidElement<{ delay?: number }>(node) ? cloneElement(node, { delay }) : node
}
