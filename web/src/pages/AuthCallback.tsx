import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Contours } from '../motion/Contours'
import { Hiker } from '../motion/Hiker'
import { TrailSpinner } from '../motion/TrailSpinner'

export const GH_TOKEN_KEY = 'th-gh-provider-token'

/** OAuth and magic-link landing. supabase-js exchanges the code in the URL; we wait for the session, keep the
 *  GitHub token for listing repositories (this tab only), then move on. */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const problem = params.get('error_description') || hash.get('error_description')
    if (problem) {
      setError(problem)
      return
    }
    const next = params.get('next') || '/app'
    if (!supabase) {
      navigate('/login', { replace: true })
      return
    }
    let done = false
    const finish = (session: { provider_token?: string | null } | null) => {
      if (done || !session) return
      done = true
      try {
        if (session.provider_token) sessionStorage.setItem(GH_TOKEN_KEY, session.provider_token)
      } catch {
        /* private mode */
      }
      navigate(next, { replace: true })
    }
    supabase.auth.getSession().then(({ data }) => finish(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, session) => finish(session))
    const timeout = setTimeout(() => !done && setError('The sign-in link did not produce a session. It may have expired — try again.'), 12000)
    return () => {
      data.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="t-pine" style={{ minHeight: '100vh', position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 24 }}>
      <Contours color="var(--lichen)" opacity={0.14} />
      <div style={{ position: 'relative', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 18 }}>
        <Hiker size={120} />
        {error ? (
          <>
            <p className="lead" style={{ maxWidth: 520 }}>{error}</p>
            <button className="btn" onClick={() => navigate('/login', { replace: true })}><span>Back to log in</span><span className="arrow">→</span></button>
          </>
        ) : (
          <TrailSpinner label="Checking your pass at the trailhead…" />
        )}
      </div>
    </div>
  )
}
