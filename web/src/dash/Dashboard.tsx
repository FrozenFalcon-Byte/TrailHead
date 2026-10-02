import { animate, AnimatePresence, motion } from 'motion/react'
import { UpdateChip } from './UpdateChip'
import { scrollTop, useSmoothScroll } from '../motion/SmoothScroll'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import './dash.css'
import { useAuth } from '../lib/auth'
import { momentTo } from '../lib/moment'
import { Palette } from './Palette'
import { RepoSplash } from './RepoSplash'
import { hiddenNav, setPrefs, usePrefs } from '../lib/prefs'
import { startSettingsSync, useAvatar, useProfile } from '../lib/profile'
import { notify } from '../lib/toast'
import { Shape, STORY } from '../motion/Shapes'
import { ALL, HELP, indexFor, itemFor, NAV, PROFILE, SETTINGS, type NavItem } from './nav'
import { Wordmark } from '../motion/Mark'
import { Select } from '../motion/Select'
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
import Settings from './pages/Settings'
import Help from './pages/Help'

export { NAV }

export function Avatar({ size = 34, radius = 10 }: { size?: number; radius?: number }) {
  const { displayName } = useAuth()
  const src = useAvatar()
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {src ? (
        <motion.img key={src} src={src} alt="" width={size} height={size} className="d-avatar" style={{ borderRadius: radius }} referrerPolicy="no-referrer" initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 20 }} />
      ) : (
        <motion.span key="initial" className="d-avatar d-avatar--initial" style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.52 }} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
          {(displayName || '?').slice(0, 1).toUpperCase()}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** Sign out behind the farewell scene, then land on the home page. */
export function useSignOut() {
  const { signOut, displayName, bypass } = useAuth()
  const { confirmSignOut } = usePrefs()
  const navigate = useNavigate()
  return async (scope: 'local' | 'global' = 'local') => {
    if (confirmSignOut && !window.confirm(scope === 'global' ? 'Sign out on every device?' : 'Sign out of Trailhead?')) return
    const { done } = momentTo({ kind: 'signout', name: bypass ? '' : displayName }, async () => {
      try {
        await signOut(scope)
      } catch {
        /* the local session is cleared either way */
      }
      navigate('/', { replace: true })
    })
    await done
    notify.info(scope === 'global' ? 'Signed out everywhere' : 'Signed out', 'Your saved trails will be here when you come back.')
  }
}

function UserMenu() {
  const { displayName, user, bypass } = useAuth()
  const navigate = useNavigate()
  const signOut = useSignOut()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])
  const items = [
    { label: 'Profile', hint: 'G P', run: () => navigate('/app/profile') },
    { label: 'Settings', hint: ',', run: () => navigate('/app/settings') },
    { label: bypass ? 'Leave local mode' : 'Sign out', hint: '', run: () => signOut() },
  ]
  return (
    <div className="d-user" ref={ref}>
      <button className="d-user__btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" data-cursor={open ? 'Close' : 'Your account'}>
        <span className="small d-user-name">{displayName}</span>
        <Avatar />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="d-user__menu" role="menu" initial={{ opacity: 0, y: -8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.14 } }} transition={{ type: 'spring', stiffness: 460, damping: 32 }}>
            <div className="d-user__who">
              <Avatar size={42} radius={13} />
              <span>
                <b>{displayName || 'You'}</b>
                <span className="small">{user?.email ?? 'local mode'}</span>
              </span>
            </div>
            {items.map((it, i) => (
              <motion.button key={it.label} role="menuitem" className={`d-user__item ${i === items.length - 1 ? 'is-out' : ''}`} onClick={() => { setOpen(false); it.run() }} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 + i * 0.04 }}>
                {it.label}
                {it.hint && <span className="cm__hint">{it.hint}</span>}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { repos, repo, setRepo, engine, setEngine, health } = useDash()
  const navigate = useNavigate()
  const location = useLocation()
  const here = itemFor(location.pathname)
  const ready = repos.filter((r) => r.status === 'ready')
  const engines = health?.engines ?? ['jev', 'llm', 'local']
  return (
    <div className="d-top">
      <button className="d-chip d-mobile-bar" onClick={onMenu} aria-label="Open menu">☰</button>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={here.to} className="d-top__here" initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -16, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
          <Shape kind={here.kind} color={here.color} glyph={here.glyph} size={22} play={false} />
          {here.label}
        </motion.span>
      </AnimatePresence>
      <span className="d-top__sep" aria-hidden />
      <Select
        label="Repository"
        mono
        value={repo}
        onChange={(v) => (v === '__add' ? navigate('/app/repos') : setRepo(v))}
        placeholder="no repository yet"
        options={[
          ...ready.map((r) => ({ value: r.repo, label: r.repo, hint: `${r.files?.toLocaleString() ?? '?'} files · ${r.commits?.toLocaleString() ?? '?'} commits` })),
          { value: '__add', label: '+ Add a repository', tone: 'action' as const },
        ]}
      />
      <Select
        label="Engine"
        value={engine}
        onChange={setEngine}
        options={engines.map((e) => ({ value: e, label: e === 'jev' ? 'Jev' : e === 'llm' ? 'LLM fallback' : 'Local (Ollama)', hint: e === 'jev' ? 'Calibrated decisions, the default' : e === 'llm' ? 'Hosted model, the comparison baseline' : 'Runs on this machine' }))}
      />
      <span className="d-top__fill" />
      <UpdateChip />
      <UserMenu />
    </div>
  )
}

type Box = { left: number; top: number; width: number; height: number }
const boxOf = (el: Element | null): Box | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return r.width ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
}

/** The page switch. The sidebar item you picked grows into a panel in that page's colour over the whole sheet,
 *  shows the page's sign, then shrinks down into the sign at the top of the new page, which takes its place.
 *  One shape travels the whole way, so nav and page read as the same thing. */
function Morph() {
  const location = useLocation()
  const [run, setRun] = useState<{ key: string; item: NavItem; from: Box; to: Box } | null>(null)
  const last = useRef(location.pathname)
  useLayoutEffect(() => {
    if (last.current === location.pathname) return
    last.current = location.pathname
    const sheet = document.querySelector('.d-sheet')?.getBoundingClientRect()
    if (!sheet) return
    const top = Math.max(sheet.top, 10)
    const to = { left: sheet.left, top, width: sheet.width, height: Math.min(sheet.bottom, window.innerHeight - 10) - top }
    const nav = boxOf(document.querySelector('.d-nav a.active'))
    const from = nav && nav.left >= 0 ? nav : { left: to.left + to.width / 2 - 30, top: to.top + 20, width: 60, height: 40 }
    document.documentElement.dataset.morph = '1'
    setRun({ key: location.pathname + Date.now(), item: itemFor(location.pathname), from, to })
  }, [location.pathname])
  if (!run) return null
  return <MorphPanel key={run.key} item={run.item} from={run.from} to={run.to} onDone={() => { delete document.documentElement.dataset.morph; setRun(null) }} />
}

function MorphPanel({ item, from, to, onDone }: { item: NavItem; from: Box; to: Box; onDone: () => void }) {
  const scope = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    const go = async () => {
      const el = scope.current
      if (!el) return
      await animate(el, { ...to, borderRadius: 32 }, { duration: 0.42, ease: [0.76, 0, 0.24, 1] })
      // The new page has mounted under the panel by now; find its sign and land on it.
      let target: Box | null = null
      for (let i = 0; i < 20 && alive && !target; i++) {
        target = boxOf(document.querySelector('.d-mast__icon'))
        if (!target) await new Promise((r) => requestAnimationFrame(r))
      }
      if (!alive) return
      if (target) {
        // The label folds away and the panel melts off, so the shape itself is what lands on the new page's sign.
        const sign = el.querySelector<HTMLElement>('.d-morph__shape')
        const label = el.querySelector<HTMLElement>('.d-morph__label')
        el.style.overflow = 'visible'
        if (label) animate(label, { opacity: 0, width: 0, marginLeft: 0 }, { duration: 0.22 })
        if (sign) animate(sign, { scale: target.width / 72, rotate: [0, -10, 0] }, { duration: 0.55, ease: [0.22, 1, 0.36, 1] })
        animate(el, { backgroundColor: 'rgba(0,0,0,0)' }, { duration: 0.3, delay: 0.12 })
        await animate(el, { ...target }, { duration: 0.55, ease: [0.22, 1, 0.36, 1] })
      } else await animate(el, { opacity: 0 }, { duration: 0.25 })
      if (alive) onDone()
    }
    go()
    // Never leave the panel over the page, even if the tab was hidden mid-switch and frames stopped.
    const bail = window.setTimeout(() => alive && onDone(), 2200)
    return () => {
      alive = false
      window.clearTimeout(bail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div ref={scope} className="d-morph" aria-hidden style={{ ...from, background: item.bg, borderRadius: 12 }}>
      <motion.div className="d-morph__sign" initial={{ opacity: 0, scale: 0.4, rotate: -20 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.18 }}>
        <span className="d-morph__shape"><Shape kind={item.kind} color={item.color} glyph={item.glyph} size={72} /></span>
        <span className="chunk d-morph__label">{item.label}</span>
      </motion.div>
    </div>
  )
}

/* Page switch. "sweep" (shown as Trail in Settings) moves the page along the sidebar's direction: going down the
   list the old page lifts away and the new one rises from below; going up it runs the other way. The masthead icon
   flies over from the sidebar on its own (see PageHead). */
const VARIANTS: Record<string, object> = {
  sweep: {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE, delay: 0.32 } },
    exit: { opacity: 0, transition: { duration: 0.16 } },
  },
  rise: { initial: { opacity: 0, y: 28, filter: 'blur(6px)' }, animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.55, ease: EASE } }, exit: { opacity: 0, y: -12, filter: 'blur(4px)', transition: { duration: 0.2 } } },
  slide: { initial: (d: number) => ({ opacity: 0, x: 70 * d }), animate: { opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } }, exit: (d: number) => ({ opacity: 0, x: -50 * d, transition: { duration: 0.2 } }) },
  none: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1, transition: { duration: 0 } } },
}

function useShortcuts(enabled: boolean) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!enabled) return
    let g = 0
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [role="menu"]')) return
      if (e.key === 'g') {
        g = performance.now()
        return
      }
      if (performance.now() - g < 900) {
        const hit = ALL.find((n) => n.key === e.key.toLowerCase())
        g = 0
        if (hit) {
          e.preventDefault()
          navigate(hit.to)
        }
        return
      }
      if (e.key === ',') navigate('/app/settings')
      else if (e.key === 'r' || e.key === 'R') window.dispatchEvent(new CustomEvent('th:refresh'))
      else if (e.key === '/') {
        const field = document.querySelector<HTMLElement>('.d-main input.field, .d-main textarea.field')
        if (field) {
          e.preventDefault()
          field.focus()
        }
      } else if (e.key === '?') notify.info('Keyboard shortcuts', '⌘K opens the command box · G then O/A/T/F/I/M/D/E/R/P/S/H jumps to a page · / focuses the search box · R refreshes · , opens Settings')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, navigate])
}

function Shell() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const { bypass, displayName } = useAuth()
  const { recheck } = useDash()
  const prefs = usePrefs()
  const signOut = useSignOut()
  useProfile()
  useShortcuts(prefs.shortcuts)
  useEffect(() => startSettingsSync(), [])
  useEffect(() => setOpen(false), [location.pathname])
  // each page names its tab, so several open tabs can be told apart
  useEffect(() => {
    document.title = `${itemFor(location.pathname).label} · Trailhead`
    return () => {
      document.title = 'Trailhead — find your way into any codebase'
    }
  }, [location.pathname])
  useEffect(() => {
    const again = () => recheck()
    window.addEventListener('th:refresh', again)
    return () => window.removeEventListener('th:refresh', again)
  }, [recheck])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  // Which way the page moves: down the sidebar list or back up it.
  const prev = useRef(location.pathname)
  const dirRef = useRef(1)
  if (prev.current !== location.pathname) {
    dirRef.current = indexFor(location.pathname) >= indexFor(prev.current) ? 1 : -1
    prev.current = location.pathname
  }
  const dir = dirRef.current
  useSmoothScroll(prefs.motion !== 'off' && prefs.smoothScroll)
  const style = prefs.motion === 'off' ? 'none' : prefs.motion === 'calm' && prefs.pageTransition === 'sweep' ? 'rise' : prefs.pageTransition

  const link = (item: NavItem, i: number) => (
    <NavLink key={item.to} to={item.to} end={item.end} title={prefs.sideCollapsed ? item.label : undefined} data-cursor={location.pathname === item.to ? 'You are here' : `${item.label} →`}>
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId="d-nav-pill" className="d-nav__pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
          <motion.span className="d-nav__icon" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: isActive ? -8 : 0 }} transition={{ type: 'spring', stiffness: 320, damping: 16, delay: i * 0.03 }}>
            <Shape kind={item.kind} color={item.color} glyph={item.glyph} size={24} play={isActive && prefs.motion === 'full'} />
          </motion.span>
          <span className="d-nav__label">{item.label}</span>
          {isActive ? <motion.span layoutId="d-nav-arrow" className="d-nav__arrow">→</motion.span> : prefs.shortcuts && <span className="d-nav__key">{item.key.toUpperCase()}</span>}
        </>
      )}
    </NavLink>
  )

  return (
    <div className={`d-shell ${prefs.sideCollapsed ? 'is-collapsed' : ''}`}>
      <aside className={`d-side ${open ? 'open' : ''}`}>
        <div className="d-side__top">
          <NavLink to="/" className="d-side__brand" data-cursor="Home →">{prefs.sideCollapsed ? <Shape kind="tag" color="var(--lime)" glyph="flag" size={30} play={false} /> : <Wordmark />}</NavLink>
          <button className="d-side__fold" onClick={() => setPrefs({ sideCollapsed: !prefs.sideCollapsed })} aria-label={prefs.sideCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-cursor={prefs.sideCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <motion.svg width={16} height={16} viewBox="0 0 16 16" animate={{ rotate: prefs.sideCollapsed ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }} aria-hidden><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></motion.svg>
          </button>
        </div>
        <nav className="d-nav" aria-label="Dashboard">
          <span className="d-nav__group">Explore</span>
          {NAV.slice(0, 6).filter((n) => !hiddenNav(prefs).has(n.to)).map(link)}
          <span className="d-nav__group">Inspect</span>
          {NAV.slice(6).filter((n) => !hiddenNav(prefs).has(n.to)).map((n, i) => link(n, i + 6))}
          <span className="d-nav__group">You</span>
          {link(PROFILE, 9)}
          {link(SETTINGS, 10)}
          {link(HELP, 11)}
        </nav>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {prefs.sidebarStory && !prefs.sideCollapsed && (
            <div className="d-side__story" aria-hidden>
              {STORY.map((st, i) => (
                <motion.span key={i} animate={prefs.motion === 'full' ? { y: [0, -7, 0] } : undefined} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.14, repeatDelay: 1.2 }}>
                  <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={26} play={false} />
                </motion.span>
              ))}
            </div>
          )}
          {prefs.slotMeter && !prefs.sideCollapsed && <SlotMeter />}
          <div className="d-side__me">
            <NavLink to="/app/profile" className="d-side__who" data-cursor="Your profile →">
              <Avatar size={36} radius={11} />
              <span className="small d-side__name">{bypass ? 'Local mode' : displayName}</span>
            </NavLink>
            <button className="d-side__out" onClick={() => signOut()} aria-label={bypass ? 'Leave local mode' : 'Sign out'} data-cursor={bypass ? 'Leave local mode' : 'Sign out'}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" /></svg>
            </button>
          </div>
        </div>
      </aside>
      <AnimatePresence>{open && <motion.div onClick={() => setOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 0.45 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'var(--solid)', zIndex: 55 }} />}</AnimatePresence>
      <Palette onSignOut={() => signOut()} />
      <RepoSplash />
      <main className="d-main">
        <div className="d-sheet">
          <TopBar onMenu={() => setOpen(true)} />
          {style === 'sweep' && <Morph />}
          <AnimatePresence mode="wait" initial={false} custom={dir} onExitComplete={scrollTop}>
            <motion.div key={location.pathname} className="d-page" custom={dir} variants={VARIANTS[style] as never} initial="initial" animate="animate" exit="exit">
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
                <Route path="settings" element={<Settings />} />
                <Route path="help" element={<Help />} />
                <Route path="*" element={<Overview />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
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
