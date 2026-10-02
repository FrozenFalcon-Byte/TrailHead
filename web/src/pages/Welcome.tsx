import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './welcome.css'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { firstName } from '../lib/moment'
import { markOnboarded } from '../lib/onboard'
import { setPrefs, usePrefs, type Accent, type Prefs } from '../lib/prefs'
import { useTheme } from '../lib/theme'
import { NAV } from '../dash/nav'
import { Mark } from '../motion/Mark'
import { Shape, STORY, type Glyph, type ShapeKind } from '../motion/Shapes'
import { TrailSpinner } from '../motion/TrailSpinner'

type Repo = { repo: string; status: string; files?: number }
const NAME = /^[\w.-]+\/[\w.-]+$/

const STEPS: { kind: ShapeKind; color: string; glyph: Glyph; label: string }[] = [
  { kind: 'circle', color: 'var(--violet)', glyph: 'flag', label: 'Hello' },
  { kind: 'square', color: 'var(--green)', glyph: 'folder', label: 'Your repo' },
  { kind: 'tag', color: 'var(--orange)', glyph: 'signal', label: 'Your look' },
  { kind: 'circle', color: 'var(--blue)', glyph: 'pine', label: 'First stop' },
]

const TOOLS = [
  { ...NAV[1], line: 'Ask a question, get an answer that cites pull requests, commits and code.' },
  { ...NAV[2], line: 'A guided walk through the files that matter, in the order they matter.' },
  { ...NAV[3], line: 'Find the code behind a behaviour, even when you do not know its name.' },
]

const ACCENTS: Accent[] = ['lime', 'orange', 'violet', 'blue', 'green', 'yellow']
const MOTION: { v: Prefs['motion']; label: string; line: string }[] = [
  { v: 'full', label: 'Lively', line: 'Every transition plays' },
  { v: 'calm', label: 'Calm', line: 'Softer, shorter moves' },
  { v: 'off', label: 'Still', line: 'No animation at all' },
]

// Steps slide along the trail: forward goes right to left, back goes the other way.
const slide = {
  initial: (d: number) => ({ x: d * 120, rotate: d * 3, opacity: 0 }),
  animate: { x: 0, rotate: 0, opacity: 1, transition: { type: 'spring' as const, stiffness: 260, damping: 28 } },
  exit: (d: number) => ({ x: d * -120, rotate: d * -3, opacity: 0, transition: { duration: 0.22 } }),
}

/** First sign-in walk-through: what Trailhead does, which repository to start on, how it should look, and where
 *  to land. Every choice can be changed later in Settings. */
export default function Welcome() {
  const { user, displayName } = useAuth()
  const navigate = useNavigate()
  const prefs = usePrefs()
  const [theme, setTheme] = useTheme()
  const [[step, dir], setStep] = useState<[number, number]>([0, 1])
  const [repos, setRepos] = useState<Repo[] | null>(null)
  const [picked, setPicked] = useState(() => {
    try {
      return localStorage.getItem('th-repo') || ''
    } catch {
      return ''
    }
  })
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [start, setStart] = useState(prefs.startPage)
  const [leaving, setLeaving] = useState(false)
  const first = (firstName(user) || displayName || 'there').split(/\s+/)[0]

  useEffect(() => {
    api<Repo[]>('/api/repos').then(
      (list) => {
        setRepos(list)
        if (!picked && list[0]) setPicked(list[0].repo)
      },
      () => setRepos([]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (n: number) => setStep([n, n > step ? 1 : -1])
  const add = async () => {
    setError('')
    const full = name.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
    if (!NAME.test(full)) return setError('Use the owner/name form, for example scrapy/scrapy.')
    setAdding(true)
    try {
      await api('/api/repos', { method: 'POST', body: JSON.stringify({ repo: full }) })
      setRepos((r) => [{ repo: full, status: 'queued' }, ...(r ?? []).filter((x) => x.repo !== full)])
      setPicked(full)
      setName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAdding(false)
    }
  }
  const finish = async () => {
    setLeaving(true)
    try {
      if (picked) localStorage.setItem('th-repo', picked)
    } catch {
      /* private mode */
    }
    setPrefs({ startPage: start })
    await markOnboarded(user)
    navigate(start, { replace: true })
  }

  return (
    <div className="w-wrap">
      <header className="w-top">
        <Mark size={30} />
        <ol className="w-steps" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s.label}>
              {i > 0 && <span className="w-steps__line"><motion.span initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} /></span>}
              <button className={`w-steps__dot ${i === step ? 'is-on' : ''}`} onClick={() => i < step && go(i)} disabled={i > step} aria-current={i === step ? 'step' : undefined} data-cursor={i < step ? `Back to ${s.label}` : undefined}>
                <motion.span initial={false} animate={{ scale: i === step ? 1.3 : i < step ? 1 : 0.8, rotate: i === step ? -8 : 0, opacity: i <= step ? 1 : 0.35 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }} style={{ display: 'block', lineHeight: 0 }}>
                  <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={30} play={i === step} />
                </motion.span>
                <span className="w-steps__label">{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button className="w-skip" onClick={finish} data-cursor="Use the defaults">Skip for now</button>
      </header>

      <main className="w-stage">
        <AnimatePresence mode="wait" custom={dir} initial={false}>
          <motion.section key={step} className="w-card" custom={dir} variants={slide} initial="initial" animate="animate" exit="exit">
            {step === 0 && (
              <>
                <div className="w-hello__shapes" aria-hidden>
                  {STORY.map((s, i) => (
                    <motion.span key={i} initial={{ y: 60, scale: 0, rotate: -30 }} animate={{ y: 0, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.1 + i * 0.08 }} whileHover={{ y: -10, rotate: i % 2 ? 10 : -10 }}>
                      <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={64} />
                    </motion.span>
                  ))}
                </div>
                <h1 className="chunk w-title">Welcome to the trail, {first}.</h1>
                <p className="lead w-lead">Trailhead reads a repository's code and its history, then answers questions about it with the pull requests and commits to back it up. Three ways in:</p>
                <div className="w-tools">
                  {TOOLS.map((t, i) => (
                    <motion.div key={t.to} className="w-tool" style={{ ['--tint' as string]: t.bg }} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.35 + i * 0.08 }} whileHover={{ y: -4 }}>
                      <Shape kind={t.kind} color={t.color} glyph={t.glyph} size={40} />
                      <strong>{t.label}</strong>
                      <span>{t.line}</span>
                    </motion.div>
                  ))}
                </div>
                <div className="w-actions">
                  <button className="btn" onClick={() => go(1)}><span>Set me up</span><span className="arrow">→</span></button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1 className="chunk w-title">Pick a repository to explore.</h1>
                <p className="lead w-lead">Trailhead reads it once: code, commits, pull requests and issues. Nothing in it is run.</p>
                <div className="w-repos">
                  {repos === null && <TrailSpinner label="Looking for repositories" />}
                  {repos?.map((r, i) => (
                    <motion.button key={r.repo} className={`w-repo ${picked === r.repo ? 'is-on' : ''}`} onClick={() => setPicked(r.repo)} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.05 }} whileTap={{ scale: 0.97 }} data-cursor={picked === r.repo ? 'Picked' : 'Pick this one'}>
                      <span className="w-repo__icon"><Shape kind={i % 3 === 0 ? 'circle' : i % 3 === 1 ? 'square' : 'tag'} color={['var(--violet)', 'var(--green)', 'var(--orange)', 'var(--blue)'][i % 4]} glyph="folder" size={34} play={picked === r.repo} /></span>
                      <span className="w-repo__name">{r.repo}</span>
                      <span className="w-repo__state">{r.status === 'ready' ? 'Ready to explore' : r.status === 'error' ? 'Needs another try' : 'Reading it now'}</span>
                      <AnimatePresence>{picked === r.repo && <motion.span className="w-repo__tick" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>✓</motion.span>}</AnimatePresence>
                    </motion.button>
                  ))}
                  {repos?.length === 0 && <p className="small">No repositories yet. Add one below — scrapy/scrapy is a good first trail.</p>}
                </div>
                <form className="w-add" onSubmit={(e) => { e.preventDefault(); add() }}>
                  <input className="field" placeholder="owner/name, or a GitHub link" value={name} onChange={(e) => setName(e.target.value)} aria-label="Repository to add" />
                  <button className="btn" disabled={adding || !name.trim()}><span>{adding ? <TrailSpinner /> : 'Add'}</span></button>
                </form>
                {error && <p className="w-error">{error}</p>}
                <div className="w-actions">
                  <button className="w-back" onClick={() => go(0)}>← Back</button>
                  <button className="btn" onClick={() => go(2)}><span>{picked ? 'Next' : 'Skip this'}</span><span className="arrow">→</span></button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1 className="chunk w-title">Make it yours.</h1>
                <p className="lead w-lead">These change the page as you pick them.</p>
                <div className="w-look">
                  <div className="w-look__group">
                    <span className="w-label">Theme</span>
                    <div className="w-themes">
                      {(['light', 'dark'] as const).map((t) => (
                        <button key={t} className={`w-theme w-theme--${t} ${theme === t ? 'is-on' : ''}`} onClick={() => setTheme(t)} data-cursor={`${t === 'light' ? 'Light' : 'Dark'} theme`}>
                          <span className="w-theme__mini" aria-hidden>
                            <i /><b /><b /><b />
                          </span>
                          {t === 'light' ? 'Light' : 'Dark'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="w-look__group">
                    <span className="w-label">Accent</span>
                    <div className="w-accents">
                      {ACCENTS.map((a, i) => (
                        <motion.button key={a} className={`w-accent ${prefs.accent === a ? 'is-on' : ''}`} onClick={() => setPrefs({ accent: a })} aria-label={a} data-cursor={a[0].toUpperCase() + a.slice(1)} whileHover={{ y: -6, rotate: i % 2 ? 8 : -8 }} whileTap={{ scale: 0.85 }} animate={{ scale: prefs.accent === a ? 1.18 : 1 }}>
                          <Shape kind={(['circle', 'square', 'tag'] as const)[i % 3]} color={`var(--${a})`} size={40} play={prefs.accent === a} />
                        </motion.button>
                      ))}
                    </div>
                  </div>
                  <div className="w-look__group">
                    <span className="w-label">Motion</span>
                    <div className="w-motions">
                      {MOTION.map((m) => (
                        <button key={m.v} className={`w-motion ${prefs.motion === m.v ? 'is-on' : ''}`} onClick={() => setPrefs({ motion: m.v })}>
                          <span className="w-motion__demo" aria-hidden>
                            <motion.i animate={m.v === 'off' ? { x: 0 } : { x: [0, 36, 0] }} transition={{ duration: m.v === 'full' ? 0.9 : 1.8, repeat: Infinity, ease: m.v === 'full' ? [0.68, -0.4, 0.32, 1.4] : 'easeInOut' }} />
                          </span>
                          <strong>{m.label}</strong>
                          <span>{m.line}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="w-actions">
                  <button className="w-back" onClick={() => go(1)}>← Back</button>
                  <button className="btn" onClick={() => go(3)}><span>Next</span><span className="arrow">→</span></button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h1 className="chunk w-title">Where should the trail start?</h1>
                <p className="lead w-lead">This is the page you land on each time you open Trailhead.</p>
                <div className="w-starts">
                  {NAV.slice(0, 6).map((n, i) => (
                    <motion.button key={n.to} className={`w-start ${start === n.to ? 'is-on' : ''}`} style={{ ['--tint' as string]: n.bg }} onClick={() => setStart(n.to)} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 20, delay: i * 0.04 }} whileHover={{ y: -4 }}>
                      <motion.span animate={{ rotate: start === n.to ? -10 : 0, scale: start === n.to ? 1.15 : 1 }} style={{ display: 'block', lineHeight: 0 }}>
                        <Shape kind={n.kind} color={n.color} glyph={n.glyph} size={44} play={start === n.to} />
                      </motion.span>
                      <strong>{n.label}</strong>
                    </motion.button>
                  ))}
                </div>
                <div className="w-actions">
                  <button className="w-back" onClick={() => go(2)}>← Back</button>
                  <button className="btn" onClick={finish} disabled={leaving}><span>{leaving ? <TrailSpinner /> : 'Hit the trail'}</span><span className="arrow">→</span></button>
                </div>
              </>
            )}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  )
}
