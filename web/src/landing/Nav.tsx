import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mark } from '../motion/Mark'
import { useSignedIn } from '../lib/auth'

export const SECTIONS = [
  { id: 'story', label: 'Story' },
  { id: 'how', label: 'How it works' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'play', label: 'Play' },
  { id: 'faq', label: 'FAQ' },
]

/** A floating trail sign: the mark, the section links with a sliding highlight, an arrow tip, and the call to action. */
export function Nav({ onJump, settled = true }: { onJump: (id: string) => void; settled?: boolean }) {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const signedIn = useSignedIn()
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0
    setHidden(y > 400 && y > prev + 2)
  })
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setOpen(false)
    onJump(id)
  }
  return (
    <>
      <motion.nav className="l-nav" initial={false} animate={{ y: hidden && !open ? -120 : 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
        <div className="l-nav__tag">
          <a href="#top" onClick={jump('top')} aria-label="Trailhead home" className="l-nav__brand">
            <span data-morph="brand" style={{ display: 'inline-block', lineHeight: 0, visibility: settled ? 'visible' : 'hidden' }}>
              <Mark size={36} />
            </span>
          </a>
          <div className="l-nav__links">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={jump(s.id)} className={active === s.id ? 'is-active' : ''}>
                {active === s.id && <motion.span layoutId="nav-bubble" className="l-nav__bubble" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
                <span style={{ position: 'relative' }}>{s.label}</span>
              </a>
            ))}
            {!signedIn && <Link to="/login" className="l-nav__login">Log in</Link>}
          </div>
          <button className="l-nav__menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            <motion.span animate={open ? { rotate: 45, y: 4 } : { rotate: 0, y: 0 }} />
            <motion.span animate={open ? { rotate: -45, y: -4 } : { rotate: 0, y: 0 }} />
          </button>
        </div>
        <Link className="l-nav__cta" to={signedIn ? '/app' : '/signup'}>
          {signedIn ? 'Open dashboard' : 'Start the trail'}
        </Link>
      </motion.nav>
      <AnimatePresence>
        {open && (
          <motion.div
            className="l-overlay t-lilac"
            initial={{ clipPath: 'polygon(0 0, 0 0, 0 100%, 0 100%)' }}
            animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
            exit={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
            transition={{ duration: 0.65, ease: [0.76, 0, 0.24, 1] }}
          >
            {[...SECTIONS, { id: 'login', label: signedIn ? 'Dashboard' : 'Log in' }].map((s, i) => (
              <motion.div key={s.id} initial={{ x: -60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.06, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
                {s.id === 'login' ? <Link to={signedIn ? '/app' : '/login'}>{s.label}</Link> : <a href={`#${s.id}`} onClick={jump(s.id)}>{s.label}</a>}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
