import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { setPrefs, usePrefs, type Prefs } from '../lib/prefs'
import { Toggle } from '../motion/Select'

/* The trail pass on the profile page can be dressed up: its colour, its outline (a ticket with a torn stub, or a
   trail-sign tag), and which parts show. The pass swings down on a hinge when it appears and leans toward the
   pointer; the customiser unfolds from the pass the same way. Choices are ordinary settings, so they sync too. */

const COLORS: Prefs['passColor'][] = ['yellow', 'orange', 'violet', 'blue', 'green', 'lime']
const PASTEL: Record<Prefs['passColor'], string> = { yellow: 'var(--butter)', orange: 'var(--peach)', violet: 'var(--lilac)', blue: 'var(--sky)', green: 'var(--mint)', lime: 'var(--limeade)' }
const INK: Record<Prefs['passColor'], string> = { yellow: 'var(--solid)', orange: '#fff', violet: '#fff', blue: '#fff', green: '#fff', lime: 'var(--solid)' }

export function PassTilt({ shape, color, children }: { shape: Prefs['passShape']; color: Prefs['passColor']; children: ReactNode }) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [3.5, -3.5]), { stiffness: 180, damping: 18 })
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-4.5, 4.5]), { stiffness: 180, damping: 18 })
  const move = (e: React.PointerEvent<HTMLElement>) => {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width - 0.5)
    py.set((e.clientY - r.top) / r.height - 0.5)
  }
  const leave = () => {
    px.set(0)
    py.set(0)
  }
  return (
    <motion.div className="p-pass-wrap" initial={reduce ? false : { rotateX: -22, y: -8 }} animate={{ rotateX: 0, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 15 }} style={{ transformOrigin: '50% 0%', transformPerspective: 1200 }}>
      <motion.section
        className={`p-pass is-${shape}`}
        style={{ rotateX: rx, rotateY: ry, transformPerspective: 1400, ['--pass' as string]: `var(--${color})`, ['--pass-bg' as string]: PASTEL[color], ['--pass-ink' as string]: INK[color] }}
        onPointerMove={move}
        onPointerLeave={leave}
      >
        {children}
      </motion.section>
      <PassCustomiser />
    </motion.div>
  )
}

export function PassCustomiser() {
  const p = usePrefs()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div className="p-cust" ref={box}>
      <motion.button className="p-cust__btn" onClick={() => setOpen(!open)} aria-expanded={open} whileTap={{ scale: 0.92 }} data-cursor="Dress up your pass">
        <motion.svg width={16} height={16} viewBox="0 0 16 16" aria-hidden animate={{ rotate: open ? 90 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
          <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
          <circle cx={8} cy={8} r={2.6} fill="none" stroke="currentColor" strokeWidth={1.8} />
        </motion.svg>
        Customise
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div className="p-cust__tray" role="dialog" aria-label="Customise your pass"
            initial={{ rotateX: -90, scaleY: 0.7 }} animate={{ rotateX: 0, scaleY: 1 }} exit={{ rotateX: -90, scaleY: 0.7, transition: { duration: 0.18 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }} style={{ transformOrigin: 'top center', transformPerspective: 800 }}>
            <span className="p-cust__label">Colour</span>
            <div className="p-cust__swatches" role="radiogroup" aria-label="Pass colour">
              {COLORS.map((c, i) => (
                <motion.button key={c} role="radio" aria-checked={p.passColor === c} aria-label={c} className={p.passColor === c ? 'is-on' : ''} onClick={() => setPrefs({ passColor: c })}
                  initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 15, delay: 0.05 + i * 0.03 }} whileHover={{ y: -3, rotate: -8 }} whileTap={{ scale: 0.85 }}
                  style={{ background: `var(--${c})` }}>
                  {p.passColor === c && <motion.span layoutId="p-cust-ring" className="p-cust__ring" transition={{ type: 'spring', stiffness: 420, damping: 28 }} />}
                </motion.button>
              ))}
            </div>
            <span className="p-cust__label">Shape</span>
            <div className="p-cust__shapes" role="radiogroup" aria-label="Pass shape">
              {(['ticket', 'tag'] as const).map((s) => (
                <button key={s} role="radio" aria-checked={p.passShape === s} className={p.passShape === s ? 'is-on' : ''} onClick={() => setPrefs({ passShape: s })}>
                  {p.passShape === s && <motion.span layoutId="p-cust-shape" className="p-cust__pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                  <svg viewBox="0 0 44 22" width={44} height={22} aria-hidden>
                    {s === 'ticket'
                      ? <><rect x={1} y={1} width={42} height={20} rx={5} fill="none" stroke="currentColor" strokeWidth={2} /><path d="M13 2v18" stroke="currentColor" strokeWidth={2} strokeDasharray="2 3" /></>
                      : <path d="M5 1h28l10 10-10 10H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" strokeWidth={2} />}
                  </svg>
                  <span>{s === 'ticket' ? 'Ticket' : 'Trail tag'}</span>
                </button>
              ))}
            </div>
            <div className="p-cust__toggles">
              <label><span>Email</span><Toggle on={p.passEmail} onChange={(v) => setPrefs({ passEmail: v })} label="Show email" /></label>
              <label><span>Stats</span><Toggle on={p.passStats} onChange={(v) => setPrefs({ passStats: v })} label="Show stats" /></label>
              <label><span>Stamps</span><Toggle on={p.passStamps} onChange={(v) => setPrefs({ passStamps: v })} label="Show stamps" /></label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
