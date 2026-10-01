import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './dash.css'
import { useAuth } from '../lib/auth'
import { Shape, STORY, type Glyph, type ShapeKind } from '../motion/Shapes'
import { Wordmark } from '../motion/Mark'
import { DashProvider, useDash } from './context'
import { EASE, SlotMeter } from './ui'
import Overview from './pages/Overview'
import Ask from './pages/Ask'
import TourPage from './pages/Tour'
import Find from './pages/Find'
import Issues from './pages/Issues'
import MapPage from './pages/Map'
import Decisions from './pages/Decisions'
import Evals from './pages/Evals'
import Repos from './pages/Repos'
import Profile from './pages/Profile'

const NAV: { to: string; label: string; end?: boolean; kind: ShapeKind; color: string; glyph: Glyph }[] = [
  { to: '/app', label: 'Overview', end: true, kind: 'circle', color: 'var(--violet)', glyph: 'folder' },
  { to: '/app/ask', label: 'Ask', kind: 'tag', color: 'var(--orange)', glyph: 'signal' },
  { to: '/app/tour', label: 'Tour', kind: 'circle', color: 'var(--blue)', glyph: 'flag' },
  { to: '/app/find', label: 'Find', kind: 'square', color: 'var(--green)', glyph: 'branch' },
  { to: '/app/issues', label: 'First issues', kind: 'square', color: 'var(--yellow)', glyph: 'pr' },
  { to: '/app/map', label: 'Map', kind: 'circle', color: 'var(--green)', glyph: 'pine' },
  { to: '/app/decisions', label: 'Decisions', kind: 'tag', color: 'var(--violet)', glyph: 'check' },
  { to: '/app/evals', label: 'Evals', kind: 'square', color: 'var(--blue)', glyph: 'grep' },
  { to: '/app/repos', label: 'Repositories', kind: 'circle', color: 'var(--orange)', glyph: 'file' },
]
const BANDS = ['var(--violet)', 'var(--lime)', 'var(--orange)']

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { repos, repo, setRepo, engine, setEngine, health } = useDash()
  const { displayName, avatar } = useAuth()
  const navigate = useNavigate()
  const ready = repos.filter((r) => r.status === 'ready')
  return (
    <div className="d-top">
      <button className="d-chip d-mobile-bar" onClick={onMenu} aria-label="Open menu">☰</button>
      <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.6 }}>Repo</span>
        <select className="d-select mono" value={repo} onChange={(e) => (e.target.value === '__add' ? navigate('/app/repos') : setRepo(e.target.value))}>
          {ready.length === 0 && <option value="">none yet</option>}
          {ready.map((r) => <option key={r.repo} value={r.repo}>{r.repo}</option>)}
          <option value="__add">+ Add a repository…</option>
        </select>
      </label>
      <label className="small" style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Which engine makes decisions. Jev is the default; the LLM engine is the comparison baseline.">
        <span style={{ opacity: 0.6 }}>Engine</span>
        <select className="d-select" value={engine} onChange={(e) => setEngine(e.target.value)}>
          {(health?.engines ?? ['jev', 'llm', 'local']).map((e) => <option key={e} value={e}>{e === 'jev' ? 'Jev' : e === 'llm' ? 'LLM fallback' : 'Local (Ollama)'}</option>)}
        </select>
      </label>
      <button onClick={() => navigate('/app/profile')} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'none', cursor: 'pointer', fontWeight: 700 }}>
        <span className="small d-user-name" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
        {avatar ? (
          <img src={avatar} alt="" width={34} height={34} style={{ borderRadius: 10 }} referrerPolicy="no-referrer" />
        ) : (
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--orange)', color: 'var(--solid)', fontFamily: 'var(--display)', fontSize: 18 }}>{(displayName || '?').slice(0, 1).toUpperCase()}</span>
        )}
      </button>
    </div>
  )
}

function Shell() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const { signOut, bypass } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="d-shell">
      <aside className={`d-side ${open ? 'open' : ''}`}>
        <NavLink to="/" style={{ textDecoration: 'none', padding: '0 8px' }}><Wordmark /></NavLink>
        <nav className="d-nav" aria-label="Dashboard">
          {NAV.map((item, i) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="d-nav-pill" className="d-nav__pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  <motion.span className="d-nav__icon" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: isActive ? -8 : 0 }} transition={{ type: 'spring', stiffness: 320, damping: 16, delay: i * 0.03 }}>
                    <Shape kind={item.kind} color={item.color} glyph={item.glyph} size={26} play={isActive} />
                  </motion.span>
                  <span style={{ position: 'relative' }}>{item.label}</span>
                  {isActive && <motion.span layoutId="d-nav-arrow" className="d-nav__arrow">→</motion.span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="d-side__story" aria-hidden>
            {STORY.map((st, i) => (
              <motion.span key={i} animate={{ y: [0, -7, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.14, repeatDelay: 1.2 }}>
                <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={30} play={false} />
              </motion.span>
            ))}
          </div>
          <SlotMeter />
          <button className="btn ghost small" onClick={async () => { await signOut(); navigate('/') }} style={{ alignSelf: 'flex-start' }}>
            <span>{bypass ? 'Leave local mode' : 'Sign out'}</span>
          </button>
        </div>
      </aside>
      <AnimatePresence>{open && <motion.div onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'var(--solid)', zIndex: 55 }} />}</AnimatePresence>
      <main className="d-main">
        <TopBar onMenu={() => setOpen(true)} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={location.pathname} style={{ position: 'relative' }}>
            {/* page switch: three accent bands sweep across, like the landing's mile markers, and the new page rises out from under them */}
            {BANDS.map((c, i) => (
              <motion.div
                key={c}
                aria-hidden
                className="d-band"
                initial={{ scaleX: 1, originX: 1 }}
                animate={{ scaleX: 0, transition: { duration: 0.5, ease: EASE, delay: 0.05 + i * 0.06 } }}
                exit={{ scaleX: 1, originX: 0, transition: { duration: 0.3, ease: EASE, delay: i * 0.05 } }}
                style={{ top: `calc(100svh * ${i / 3})`, background: c }}
              />
            ))}
            <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay: 0.15 } }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
              <Routes location={location}>
                <Route index element={<Overview />} />
                <Route path="ask" element={<Ask />} />
                <Route path="tour" element={<TourPage />} />
                <Route path="find" element={<Find />} />
                <Route path="issues" element={<Issues />} />
                <Route path="map" element={<MapPage />} />
                <Route path="decisions" element={<Decisions />} />
                <Route path="evals" element={<Evals />} />
                <Route path="repos" element={<Repos />} />
                <Route path="profile" element={<Profile />} />
                <Route path="*" element={<Overview />} />
              </Routes>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

export default function Dashboard() {
  return (
    <DashProvider>
      <Shell />
    </DashProvider>
  )
}
