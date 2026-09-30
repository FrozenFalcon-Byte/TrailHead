import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wordmark } from '../motion/Mark'
import { useSignedIn } from '../lib/auth'

export const SECTIONS = [
  { id: 'how', label: 'How it works' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'rules', label: 'Guardrails' },
  { id: 'faq', label: 'FAQ' },
]

export function Nav({ onJump }: { onJump: (id: string) => void }) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const signedIn = useSignedIn()
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0
    setHidden(y > 300 && y > prev)
  })
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(false)
    onJump(id)
  }
  return (
    <>
      <motion.nav className="l-nav" animate={{ y: hidden && !open ? -110 : 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
        <a href="#top" onClick={jump('top')} aria-label="Trailhead home" style={{ textDecoration: 'none' }}>
          <Wordmark />
        </a>
        <div className="l-nav__links">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} onClick={jump(s.id)}>{s.label}</a>
          ))}
        </div>
        <div className="l-nav__right t-pine" style={{ background: 'transparent' }}>
          {!signedIn && <Link className="l-nav__login" to="/login">Log in</Link>}
          <Link className="btn small" to={signedIn ? '/app' : '/signup'}>
            <span>{signedIn ? 'Open dashboard' : 'Start the trail'}</span>
            <span className="arrow">→</span>
          </Link>
          <button className="btn small l-nav__menu" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            <span>{open ? 'Close' : 'Menu'}</span>
            <span className="arrow">{open ? '×' : '≡'}</span>
          </button>
        </div>
      </motion.nav>
      <AnimatePresence>
        {open && (
          <motion.div
            className="l-overlay t-bark"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(100% 0 0% 0)' }}
            transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}
          >
            {[...SECTIONS, { id: 'login', label: signedIn ? 'Dashboard' : 'Log in' }].map((s, i) => (
              <motion.div key={s.id} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                {s.id === 'login' ? <Link to={signedIn ? '/app' : '/login'}>{s.label}</Link> : <a href={`#${s.id}`} onClick={jump(s.id)}>{s.label}</a>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
