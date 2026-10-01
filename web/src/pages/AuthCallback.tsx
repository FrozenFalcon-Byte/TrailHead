import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { motion } from 'motion/react'
import { Shape, STORY } from '../motion/Shapes'
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
    <div className="t-lilac" style={{ minHeight: '100vh', position: 'relative', display: 'grid', placeItems: 'center', overflow: 'hidden', padding: 24 }}>
      <div style={{ position: 'relative', textAlign: 'center', display: 'grid', justifyItems: 'center', gap: 18 }}>
        <div style={{ display: 'flex', gap: 12 }} aria-hidden>
          {STORY.map((st, i) => (
            <motion.span key={i} animate={{ y: [0, -14, 0], rotate: [0, i % 2 ? 8 : -8, 0] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.12, repeatDelay: 0.6 }}>
              <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={48} play={false} />
            </motion.span>
          ))}
        </div>
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
