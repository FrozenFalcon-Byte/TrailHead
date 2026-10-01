import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { listSaved, type Saved } from '../../lib/history'
import { Shape, type Glyph, type ShapeKind } from '../../motion/Shapes'
import { useDash } from '../context'
import { ago, Card, EASE, Gate, Loading, Note, PageHead, q, Stat, useFetch, type Theme } from '../ui'

type OverviewData = {
  repo: string; head: string; files: number; tests: number; symbols: number; commits: number; pull_requests: number; issues: number
  comments: number; links: number; annotated_files: number; layers: Record<string, number>; top_dirs: { path: string; summary: string }[]
}

const ACTIONS: { to: string; title: string; text: string; theme: Theme; kind: ShapeKind; color: string; glyph: Glyph }[] = [
  { to: '/app/ask', title: 'Ask', text: 'Where, how and why — cited, or an honest “not sure”.', theme: 'sky', kind: 'tag', color: 'var(--orange)', glyph: 'signal' },
  { to: '/app/tour', title: 'Tour', text: 'Give a goal, get the files to read, in order.', theme: 'mint', kind: 'circle', color: 'var(--blue)', glyph: 'flag' },
  { to: '/app/find', title: 'Find', text: 'Watch the beam walk the tree to the right file.', theme: 'peach', kind: 'square', color: 'var(--green)', glyph: 'branch' },
  { to: '/app/issues', title: 'First issues', text: 'Open issues ranked by how gentle they are.', theme: 'lilac', kind: 'square', color: 'var(--yellow)', glyph: 'pr' },
]

export default function Overview() {
  const { repo, offline } = useDash()
  const { displayName, bypass } = useAuth()
  const { data, error, loading } = useFetch<OverviewData>(repo ? `/api/overview?${q(repo)}` : null)
  const [recent, setRecent] = useState<(Saved<unknown> & { type: string })[]>([])
  useEffect(() => {
    if (!repo) return
    Promise.all([listSaved('asks', repo, 5), listSaved('tours', repo, 5)])
      .then(([a, t]) => setRecent([...a.map((x) => ({ ...x, type: 'ask' })), ...t.map((x) => ({ ...x, type: 'tour' }))].sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 6)))
      .catch(() => setRecent([]))
  }, [repo])

  const first = bypass ? '' : displayName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const layerTotal = data ? Object.values(data.layers).reduce((a, b) => a + b, 0) : 0
  const layerColors = ['var(--violet)', 'var(--orange)', 'var(--green)', 'var(--yellow)', 'var(--blue)', 'var(--lime)', 'var(--stop)', 'var(--dim)']

  return (
    <>
      <PageHead theme="lilac" kicker={repo || 'No repository yet'} title={first ? `${greeting}, ${first}.` : 'Base camp.'} oblique="Pick a trail" note="every answer here is decided by Jev and backed by the repo's own history" />
      <div className="d-body">
        <Gate />
        {error && !offline && <Note tone="error">{error}</Note>}
        {loading && !data && <Loading label="Reading the map" />}
        {data && (
          <>
            <div className="d-grid">
              <Stat i={0} theme="mint" label="source files" value={data.files.toLocaleString()} />
              <Stat i={1} theme="cream" label="tests" value={data.tests.toLocaleString()} />
              <Stat i={2} theme="peach" label="symbols" value={data.symbols.toLocaleString()} />
              <Stat i={3} theme="sky" label="commits" value={data.commits.toLocaleString()} />
              <Stat i={4} theme="lilac" label="pull requests" value={data.pull_requests.toLocaleString()} />
              <Stat i={5} theme="cream" label="issues" value={data.issues.toLocaleString()} />
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {ACTIONS.map((a, i) => (
                <motion.div key={a.to} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.07, duration: 0.7, ease: EASE }} whileHover={{ y: -6, rotate: i % 2 ? 1 : -1 }}>
                  <Link to={a.to} className={`d-action t-${a.theme}`}>
                    <span className="d-action__shape"><Shape kind={a.kind} color={a.color} glyph={a.glyph} size={44} /></span>
                    <span className="display d-action__title">{a.title}</span>
                    <span className="body" style={{ color: 'var(--fg-soft)' }}>{a.text}</span>
                    <span className="d-action__go">Open <span aria-hidden>→</span></span>
                  </Link>
                </motion.div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              <Card title="What the files are" aside={<span className="small" style={{ opacity: 0.6 }}>{data.annotated_files} files annotated</span>} delay={0.3}>
                {layerTotal === 0 ? (
                  <p className="body" style={{ opacity: 0.7 }}>No layer annotations yet. Run <span className="mono">trailhead annotate file</span>.</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                      {Object.entries(data.layers).map(([k, n], i) => (
                        <motion.div key={k} title={`${k}: ${n}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: n }} transition={{ duration: 1, delay: 0.4 + i * 0.05, ease: EASE }} style={{ flexBasis: 0, background: layerColors[i % layerColors.length] }} />
                      ))}
                    </div>
                    <div className="d-row" style={{ gap: 14 }}>
                      {Object.entries(data.layers).map(([k, n], i) => (
                        <span key={k} className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: layerColors[i % layerColors.length] }} /> {k.replace(/_/g, ' ')} <b>{n}</b>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </Card>
              <Card title="Top of the tree" delay={0.35}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.top_dirs.slice(0, 7).map((d) => (
                    <Link key={d.path} to={`/app/map?path=${encodeURIComponent(d.path)}`} style={{ textDecoration: 'none' }}>
                      <div className="mono" style={{ fontWeight: 700 }}>{d.path}/</div>
                      <div className="small" style={{ opacity: 0.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{d.summary || 'No summary yet.'}</div>
                    </Link>
                  ))}
                </div>
              </Card>
              <Card title="Your recent trails" delay={0.4}>
                {recent.length === 0 ? (
                  <p className="body" style={{ opacity: 0.7 }}>Nothing saved for this repository yet. Asks and tours you run are kept here.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {recent.map((r) => (
                      <Link key={r.id} to={`/app/${r.type}?saved=${r.id}`} style={{ textDecoration: 'none', display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <span className="d-badge" style={{ background: r.type === 'ask' ? 'var(--sky)' : 'var(--mint)', color: r.type === 'ask' ? 'var(--blue)' : 'var(--green)' }}>{r.type}</span>
                        <span style={{ fontWeight: 650, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                        <span className="small" style={{ opacity: 0.55 }}>{ago(r.created_at)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
            <p className="small" style={{ opacity: 0.5 }}>
              Snapshot at <span className="mono">{data.head?.slice(0, 10)}</span> · {data.comments.toLocaleString()} comments · {data.links.toLocaleString()} cross-links between issues, pull requests and commits
            </p>
          </>
        )}
      </div>
    </>
  )
}
