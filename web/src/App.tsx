import { AnimatePresence, MotionConfig } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Curtain } from './motion/Curtain'
import { Loader } from './motion/Loader'
import { ThemeSwitch } from './motion/ThemeSwitch'
import { TrailCursor } from './motion/TrailCursor'
import { useAuth, useSignedIn } from './lib/auth'
import Landing from './pages/Landing'
import AuthPage from './pages/AuthPage'
import AuthCallback from './pages/AuthCallback'
import Welcome from './pages/Welcome'
import { isOnboarded } from './lib/onboard'
import { TrailSpinner } from './motion/TrailSpinner'
import { Toaster } from './motion/Toaster'
import { ContextMenu } from './motion/ContextMenu'
import { QrSheet } from './motion/QrSheet'
import { MomentLayer } from './motion/Moment'
import { DashIntro } from './motion/DashIntro'
import { usePref } from './lib/prefs'
import { ArrivingSheet, takeArrival } from './motion/UpdateSheet'

// Read once per page load: set when the previous page reloaded itself into a new build.
const ARRIVAL = takeArrival()

// The dashboard is its own bundle, so the landing page loads light.
const Dashboard = lazy(() => import('./dash/Dashboard'))

/** Redirect exactly once. <Navigate> would fire again every time the page re-renders while the curtain plays its
 *  exit, and that loops. */
function Go({ to, from }: { to: string; from?: string }) {
  const navigate = useNavigate()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    navigate(to, { replace: true, state: from ? { from } : undefined })
  }, [navigate, to, from])
  return <div className="t-cream" style={{ minHeight: '100vh' }} />
}

/** Signed-in only. A first sign-in goes through the welcome walk-through before the dashboard. */
function Protected({ children, welcome = false }: { children: React.ReactNode; welcome?: boolean }) {
  const { ready, user } = useAuth()
  const signedIn = useSignedIn()
  const location = useLocation()
  const from = useRef(location.pathname + location.search)
  if (!ready)
    return (
      <div className="t-cream" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <TrailSpinner label="Checking your session" />
      </div>
    )
  if (!signedIn) return <Go to="/login" from={from.current} />
  if (!welcome && !isOnboarded(user)) return <Go to="/welcome" />
  return <>{children}</>
}

export default function App() {
  const location = useLocation()
  // Every full load of the landing page plays the loader; other entry points (dashboard, auth callback) skip it.
  const [loading, setLoading] = useState(location.pathname === '/' && !ARRIVAL)
  const [arriving, setArriving] = useState(!!ARRIVAL)
  const arrived = useCallback(() => setArriving(false), [])
  const [revealed, setRevealed] = useState(location.pathname !== '/')
  const reveal = useCallback(() => setRevealed(true), [])
  const done = useCallback(() => setLoading(false), [])
  // Only the top-level area switches pages with the curtain; moving around inside the dashboard has its own, lighter transition.
  const area = location.pathname.split('/')[1] || 'home'
  useEffect(() => {
    if (area !== 'app') window.scrollTo(0, 0)
  }, [area])

  const motionPref = usePref('motion')
  const introPref = usePref('dashIntro')
  // A full load straight into the dashboard gets its own intro instead of a spinner.
  const [intro, setIntro] = useState(() => !ARRIVAL && location.pathname.startsWith('/app') && motionPref !== 'off' && introPref && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const introDone = useCallback(() => setIntro(false), [])

  return (
    <MotionConfig reducedMotion={motionPref === 'off' ? 'always' : 'user'}>
      <TrailCursor />
      <ThemeSwitch />
      {loading && <Loader onReveal={reveal} onDone={done} />}
      {intro && <DashIntro onDone={introDone} />}
      {arriving && ARRIVAL && <ArrivingSheet arrival={ARRIVAL} onDone={arrived} />}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={area === 'login' || area === 'signup' ? 'auth' : area}>
          <Route path="/" element={<Curtain><Landing ready={revealed} settled={!loading} /></Curtain>} />
          <Route path="/login" element={<Curtain><AuthPage /></Curtain>} />
          <Route path="/signup" element={<Curtain><AuthPage /></Curtain>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/welcome" element={<Curtain><Protected welcome><Welcome /></Protected></Curtain>} />
          <Route path="/app/*" element={<Curtain><Protected><Suspense fallback={<div className="t-cream" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><TrailSpinner label="Packing the dashboard" /></div>}><Dashboard /></Suspense></Protected></Curtain>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
      <QrSheet />
      <ContextMenu />
      <Toaster />
      <MomentLayer />
    </MotionConfig>
  )
}
