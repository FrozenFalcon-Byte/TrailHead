import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import './auth.css'
import { useAuth, useSignedIn } from '../lib/auth'
import { authBypass, supabase, supabaseConfigured } from '../lib/supabase'
import { firstName, playMoment, type MomentMethod } from '../lib/moment'
import { Shape, STORY } from '../motion/Shapes'
import { Wordmark } from '../motion/Mark'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailSpinner } from '../motion/TrailSpinner'
import { AuthScene, CAPTION, type Method } from './AuthScene'

const EASE = [0.22, 1, 0.36, 1] as const

function PasskeyIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M6.5 18.5C5.6 16.6 5 14.4 5 12a7 7 0 0 1 12.2-4.7M19 12c0 1.6-.2 3.1-.6 4.5M9 20.5C8.4 18.6 8 16.3 8 13.5a4 4 0 0 1 8 0c0 2.4-.3 4.6-.9 6.5M12 13v1.5c0 2.4-.3 4.6-.9 6.5" />
    </svg>
  )
}
function GitHubIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  )
}
function GoogleIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

export default function AuthPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const mode: 'login' | 'signup' = location.pathname === '/signup' ? 'signup' : 'login'
  const auth = useAuth()
  const signedIn = useSignedIn()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [hover, setHover] = useState<Method | null>(null)
  const next = (location.state as { from?: string } | null)?.from || '/app'

  const run = (key: string, fn: () => Promise<void>) => async () => {
    setBusy(key)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (e) {
      // The browser's WebAuthn errors are opaque; say what to actually do.
      if (key === 'passkey' && e instanceof Error && /not allowed|timed out|NotAllowed|abort/i.test(`${e.name} ${e.message}`))
        setError('The passkey prompt was closed or timed out. No passkey yet? Sign in with GitHub or email, then add one from Profile.')
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  // The welcome scene covers the screen first, and the dashboard swaps in underneath it.
  const greet = async (method: MomentMethod, to: string) => {
    const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } }
    const { covered } = playMoment({ kind: 'signin', method, name: firstName(data.session?.user) || auth.displayName })
    await covered
    navigate(to)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    run('email', async () => {
      if (mode === 'login') {
        await auth.signInWithEmail(email, password)
        await greet('email', next)
      } else {
        const { needsConfirmation } = await auth.signUpWithEmail(email, password, name)
        if (needsConfirmation) setInfo('Check your inbox — we sent a link to confirm your email. It brings you straight to your dashboard.')
        else await greet('email', '/app')
      }
    })()
  }

  const disabled = !supabaseConfigured || busy !== null
  // The art panel plays the graphic for whichever way in you are pointing at, typing into, or waiting on.
  const shown: Method | null = (busy as Method | null) ?? hover
  const aim = (m: Method) => ({
    onPointerEnter: () => setHover(m),
    onPointerLeave: () => setHover((h) => (h === m ? null : h)),
    onFocus: () => setHover(m),
    onBlur: () => setHover((h) => (h === m ? null : h)),
  })

  return (
    <div className="a-wrap">
      <aside className="a-art t-lilac">
        <Link to="/" style={{ textDecoration: 'none', position: 'relative' }}><Wordmark /></Link>
        <div style={{ position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.h1 key={mode} className="display" style={{ fontSize: 'clamp(44px, min(6vw, 10svh), 104px)', lineHeight: 0.95 }} exit={{ opacity: 0, y: -30, transition: { duration: 0.25 } }}>
              {mode === 'login' ? (
                <>
                  <SplitReveal text="Welcome" immediate delay={0.5} />
                  <br />
                  <span className="a-hl"><SplitReveal text="back" immediate delay={0.6} /></span> <SplitReveal text="to the trail" immediate delay={0.65} />
                </>
              ) : (
                <>
                  <SplitReveal text="Your first" immediate delay={0.5} />
                  <br />
                  <span className="a-hl"><SplitReveal text="step" immediate delay={0.6} /></span> <SplitReveal text="starts here" immediate delay={0.65} />
                </>
              )}
            </motion.h1>
          </AnimatePresence>
          <p className="body" style={{ fontSize: 20, color: 'var(--fg-soft)', marginTop: 18 }}>One repo, one goal, one clear path.</p>
        </div>
        <div className="a-stage">
          <AnimatePresence mode="wait">
            {shown ? (
              <motion.div key={shown} className="a-scene" initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, transition: { duration: 0.18 } }} transition={{ duration: 0.4, ease: EASE }}>
                <AuthScene method={shown} />
                <span className="a-scene__cap mono">{busy ? 'working… ' : ''}{CAPTION[shown]}</span>
              </motion.div>
            ) : (
              <motion.div key="trail" className="a-trail" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 20, transition: { duration: 0.2 } }}>
          {STORY.map((st, i) => (
            <motion.span key={i} className="a-trail__stop" style={{ ['--i' as string]: i }} initial={{ scale: 0, rotate: -60 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 13, delay: 0.5 + i * 0.12 }}>
              <motion.span animate={{ y: [0, -8, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.25 }} style={{ display: 'block', lineHeight: 0 }}>
                <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
              </motion.span>
            </motion.span>
          ))}
        </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      <section className="a-form t-cream">
        <div style={{ maxWidth: 460, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="a-tabs" role="tablist">
            {(['login', 'signup'] as const).map((m) => (
              <Link key={m} to={m === 'login' ? '/login' : '/signup'} replace state={location.state} role="tab" aria-selected={mode === m} style={{ color: mode === m ? 'var(--on-solid)' : 'var(--ink)', transition: 'color .3s' }}>
                {mode === m && <motion.span layoutId="auth-tab" style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'var(--solid)', zIndex: -1 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                {m === 'login' ? 'Log in' : 'Sign up'}
              </Link>
            ))}
          </div>

          <h2 className="chunk" style={{ fontSize: 'clamp(34px, 4vw, 52px)' }}>{mode === 'login' ? 'Log in to Trailhead' : 'Create your account'}</h2>

          {!supabaseConfigured && (
            <div className="a-note" style={{ background: 'var(--chip)' }}>
              Sign-in is not configured yet. Add <span className="mono">VITE_SUPABASE_URL</span> and <span className="mono">VITE_SUPABASE_ANON_KEY</span> to <span className="mono">web/.env</span> (see <span className="mono">docs/supabase.md</span>).
              {authBypass && (
                <div style={{ marginTop: 10 }}>
                  <button className="btn small" style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }} onClick={() => navigate('/app')}>
                    <span>Continue in local mode</span><span className="arrow">→</span>
                  </button>
                </div>
              )}
            </div>
          )}
          {signedIn && supabaseConfigured && (
            <div className="a-note" style={{ background: 'var(--lime)', color: 'var(--solid)' }}>
              You are signed in as {auth.displayName}. <Link to="/app">Open your dashboard →</Link>
            </div>
          )}

          <button {...aim('github')} className="a-provider" style={{ background: 'var(--solid)', color: 'var(--on-solid)', boxShadow: 'inset 0 0 0 1.5px var(--line)' }} disabled={disabled} onClick={run('github', () => auth.signInWith('github'))}>
            {busy === 'github' ? <TrailSpinner /> : <GitHubIcon />} Continue with GitHub
          </button>
          {/* Google is switched off until its OAuth client is set up in Supabase. */}
          <button className="a-provider" style={{ background: 'var(--surface)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2px var(--line)' }} disabled title="Google sign-in is not available yet">
            <GoogleIcon /> Continue with Google <span className="a-soon">soon</span>
          </button>
          {/* Passkeys attach to an account that already exists, so only the log-in side offers one. */}
          {mode === 'login' && (
            <button
              {...aim('passkey')}
              className="a-provider"
              style={{ background: 'var(--lilac)', color: 'var(--ink)', boxShadow: 'inset 0 0 0 2px var(--violet)' }}
              disabled={disabled}
              onClick={run('passkey', async () => {
                await auth.signInWithPasskey()
                await greet('passkey', next)
              })}
            >
              {busy === 'passkey' ? <TrailSpinner /> : <PasskeyIcon />} Sign in with a passkey
            </button>
          )}

          <div className="a-divider">or with email</div>

          <form {...aim('email')} onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 10, ['--fg' as string]: 'var(--ink)' }}>
            <AnimatePresence initial={false}>
              {mode === 'signup' && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} style={{ overflow: 'hidden' }}>
                  <input className="field" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-label="Your name" />
                </motion.div>
              )}
            </AnimatePresence>
            <input className="field" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-label="Email" />
            <input className="field" type="password" required minLength={8} placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-label="Password" />
            <button className="btn" type="submit" disabled={disabled} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)', alignSelf: 'flex-start', marginTop: 4 }}>
              <span>{busy === 'email' ? <TrailSpinner /> : mode === 'login' ? 'Log in' : 'Create account'}</span>
              <span className="arrow">→</span>
            </button>
          </form>
          <button
            type="button"
            {...aim('magic')}
            onClick={run('magic', async () => {
              if (!email) throw new Error('Enter your email first.')
              await auth.sendMagicLink(email)
              setInfo(`Magic link sent to ${email}. Open it on this device to sign in.`)
            })}
            disabled={disabled}
            style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', alignSelf: 'flex-start' }}
          >
            {busy === 'magic' ? 'Sending…' : 'Email me a magic link instead'}
          </button>

          <AnimatePresence>
            {(error || info) && (
              <motion.div key={error || info} className="a-note" initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} style={{ background: error ? 'color-mix(in srgb, var(--stop) 14%, var(--surface))' : 'var(--lime)', color: error ? 'var(--stop)' : 'var(--solid)' }} role={error ? 'alert' : 'status'}>
                {error || info}
              </motion.div>
            )}
          </AnimatePresence>
          <p className="small" style={{ opacity: 0.6, marginTop: 6 }}>By continuing you agree to use Trailhead on repositories you are allowed to read. We never run repository code.</p>
        </div>
      </section>
    </div>
  )
}
