import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Curtain } from './motion/Curtain'
import { Loader } from './motion/Loader'
import { useAuth, useSignedIn } from './lib/auth'
import Landing from './pages/Landing'
import AuthPage from './pages/AuthPage'
import AuthCallback from './pages/AuthCallback'
import { TrailSpinner } from './motion/TrailSpinner'

// The dashboard is its own bundle, so the landing page loads light.
const Dashboard = lazy(() => import('./dash/Dashboard'))

function Protected({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth()
  const signedIn = useSignedIn()
  const location = useLocation()
  if (!ready)
    return (
      <div className="t-pine" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <TrailSpinner label="Checking your session" />
      </div>
    )
  return signedIn ? <>{children}</> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}

const firstVisit = (() => {
  try {
    return !sessionStorage.getItem('th-booted')
  } catch {
    return true
  }
})()

export default function App() {
  const location = useLocation()
  const [booted, setBooted] = useState(!firstVisit || location.pathname.startsWith('/auth/'))
  const done = useCallback(() => {
    setBooted(true)
    try {
      sessionStorage.setItem('th-booted', '1')
    } catch {
      /* private mode */
    }
  }, [])
  // Only the top-level area switches pages with the curtain; moving around inside the dashboard has its own, lighter transition.
  const area = location.pathname.split('/')[1] || 'home'
  useEffect(() => {
    if (area !== 'app') window.scrollTo(0, 0)
  }, [area])

  return (
    <>
      {!booted && <Loader onDone={done} />}
      <AnimatePresence mode="wait" initial={false}>
        <Routes location={location} key={area === 'login' || area === 'signup' ? 'auth' : area}>
          <Route path="/" element={<Curtain><Landing ready={booted} /></Curtain>} />
          <Route path="/login" element={<Curtain><AuthPage /></Curtain>} />
          <Route path="/signup" element={<Curtain><AuthPage /></Curtain>} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/app/*" element={<Curtain><Protected><Suspense fallback={<div className="t-pine" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><TrailSpinner label="Packing the dashboard" /></div>}><Dashboard /></Suspense></Protected></Curtain>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  )
}
