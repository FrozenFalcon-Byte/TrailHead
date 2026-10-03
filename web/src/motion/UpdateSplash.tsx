import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cornerOffset, useCornerSlot } from '../lib/corner'
import { usePref } from '../lib/prefs'
import { useRelease } from '../lib/version'
import { Mark } from './Mark'
import { Shape, type Glyph, type ShapeKind } from './Shapes'
import { SplitReveal } from './SplitReveal'
import { LeavingSheet } from './UpdateSheet'

/* When a newer build of the site is out, wherever you are (landing, guide, dashboard), a splash rolls up: the
   mountains rise, the sun comes up, and the card says what changed. "Later" folds the splash down into the corner, where a small flag
   springs up that opens it again; "Update now" hands over to the walk that carries on through the reload. */

const BULLETS: { kind: ShapeKind; color: string; glyph: Glyph }[] = [
  { kind: 'tag', color: 'var(--orange)', glyph: 'flag' },
  { kind: 'circle', color: 'var(--violet)', glyph: 'signal' },
  { kind: 'square', color: 'var(--green)', glyph: 'branch' },
  { kind: 'circle', color: 'var(--blue)', glyph: 'pr' },
]
const RIDGES = [
  { d: 'M0 260 L0 150 L120 90 L230 140 L360 60 L480 130 L620 70 L760 140 L880 80 L1000 120 L1000 260 Z', fill: 'var(--lilac)', delay: 0.1 },
  { d: 'M0 260 L0 180 C 140 140, 260 170, 380 150 C 520 126, 640 180, 780 160 C 880 146, 950 160, 1000 150 L1000 260 Z', fill: 'var(--sky)', delay: 0.2 },
  { d: 'M0 260 L0 214 C 160 190, 320 222, 500 204 C 680 186, 820 222, 1000 200 L1000 260 Z', fill: 'var(--mint)', delay: 0.3 },
]

export function UpdateSplash() {
  const release = useRelease()
  const notice = usePref('updateNotice')
  const reduce = useReducedMotion()
  // 'off' until a release is seen, so the corner flag never flashes up before the splash rolls in.
  const [view, setView] = useState<'off' | 'open' | 'chip'>('off')
  const [going, setGoing] = useState(false)
  const open = view === 'open'
  const setOpen = (v: boolean) => {
    folded.current = !v
    setView(v ? 'open' : 'chip')
  }
  const shown = useRef('')
  // The chip sits under the splash while it closes, and the splash clips down onto exactly where it is.
  const chip = useRef<DOMRect | null>(null)
  const folded = useRef(false)
  const slot = useCornerSlot('update', view === 'chip' && !going)

  useEffect(() => {
    if (!release || shown.current === release.id) return
    shown.current = release.id
    if (notice === 'auto' && document.visibilityState === 'hidden') return void window.location.reload()
    setView(notice === 'quiet' ? 'chip' : 'open')
  }, [release, notice])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setView('chip')
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open])

  if (!release || view === 'off') return null
  // Commit subjects run long; the part before a colon is the headline, the rest is trimmed.
  const changes = release.changes.slice(0, 3).map((c) => { const head = c.split(':')[0]; const t = head.length >= 12 && head.length < 90 ? head : c; return t.length > 96 ? `${t.slice(0, 94).trimEnd()}…` : t })
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 220, damping: 26 }
  const c = chip.current
  // where the chip will sit in the corner stack, which may have moved since it was last measured
  const base = window.innerWidth <= 640 ? 12 : 18
  const h = c?.height ?? 40
  const box = { left: base, top: window.innerHeight - base - h - cornerOffset('update'), w: c?.width ?? 150, h }
  const into = `inset(${box.top}px ${window.innerWidth - box.left - box.w}px ${window.innerHeight - box.top - box.h}px ${box.left}px round 18px)`
  const fold = { duration: 0.5, ease: [0.76, 0, 0.24, 1] as const }

  return createPortal(
    <>
      <AnimatePresence>
        {open ? (
          <motion.div key="splash" className="usp" role="dialog" aria-modal="true" aria-label="A new version is ready"
            initial={reduce ? false : { y: '100%' }} animate={{ y: 0, clipPath: 'inset(0px 0px 0px 0px round 0px)' }} exit={reduce ? { opacity: 0 } : { clipPath: into, transition: fold }}
            transition={spring}>
            {/* ink wipes up as it folds, so it lands in the chip's own colour */}
            <motion.span className="usp-ink" aria-hidden style={{ clipPath: 'inset(100% 0 0 0)' }} exit={reduce ? undefined : { clipPath: 'inset(0% 0 0 0)', transition: { duration: 0.34, delay: 0.12, ease: [0.65, 0, 0.35, 1] } }} />
            <motion.div className="usp-in" initial={{ y: 30 }} animate={{ y: 0 }} exit={{ y: 60, transition: { duration: 0.3, ease: [0.76, 0, 0.24, 1] } }} transition={spring}>
              <motion.span className="usp-mark" initial={{ rotate: -30, scale: 0.4 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 13, delay: 0.15 }}>
                <Mark size={64} />
              </motion.span>
              <span className="usp-kicker">New version</span>
              <SplitReveal as="h2" className="usp-title" text="A fresh trail is ready" immediate delay={0.2} stagger={0.05} />
              {changes.length > 0 && (
                <ol className="usp-list">
                  {changes.map((c, i) => (
                    <motion.li key={c + i} initial={{ y: 24, rotate: -3, scale: 0.94 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.35 + i * 0.07 }}>
                      <motion.span className="usp-bullet" initial={{ rotate: -40, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14, delay: 0.45 + i * 0.07 }}>
                        <Shape {...BULLETS[i % BULLETS.length]} size={22} play={false} />
                      </motion.span>
                      <span>{c}</span>
                    </motion.li>
                  ))}
                </ol>
              )}
              <div className="usp-go">
                <motion.button className="usp-btn" whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => { setOpen(false); setGoing(true) }} data-cursor="Reload into the new version">
                  Update now
                  <motion.svg width={16} height={16} viewBox="0 0 16 16" aria-hidden animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}>
                    <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                </motion.button>
                <button className="usp-later" onClick={() => setOpen(false)} data-cursor="Keep it in the corner">Later</button>
              </div>
            </motion.div>
            <svg className="usp-land" viewBox="0 0 1000 260" preserveAspectRatio="xMidYMax slice" aria-hidden>
              <motion.circle cx={780} cy={120} r={44} fill="var(--yellow)" initial={{ y: 140 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 60, damping: 14, delay: 0.25 }} />
              {RIDGES.map((r, i) => (
                <motion.path key={i} d={r.d} fill={r.fill} initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200, transition: { duration: 0.3, ease: [0.76, 0, 0.24, 1] } }} transition={{ type: 'spring', stiffness: 90, damping: 18, delay: r.delay }} />
              ))}
              <motion.path d="M90 240 C 260 210, 380 236, 520 214 S 780 190, 900 196" fill="none" stroke="var(--orange)" strokeWidth={4} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, delay: 0.5, ease: [0.22, 1, 0.36, 1] }} />
            </svg>
          </motion.div>
        ) : (
          !going && (
            <motion.button key="chip" className="usp-chip" onClick={() => setOpen(true)} ref={(el: HTMLButtonElement | null) => { if (el) chip.current = el.getBoundingClientRect(); slot.measure(el) }}
              initial={reduce || folded.current ? false : { scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0, y: -slot.offset, transition: { type: 'spring', stiffness: 380, damping: 18, delay: 0.25, y: { type: 'spring', stiffness: 300, damping: 28 } } }} exit={{ scale: 0, rotate: 20, transition: { duration: 0.15 } }}
              style={{ borderRadius: 18, transformOrigin: 'left bottom' }} aria-label="A new version is ready" data-cursor="See what changed">
              <motion.span animate={{ rotate: [0, -10, 0] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4 }} style={{ display: 'inline-flex' }}>
                <Shape kind="tag" color="var(--orange)" glyph="flag" size={24} play={false} />
              </motion.span>
              <span>New version</span>
            </motion.button>
          )
        )}
      </AnimatePresence>
      {going && <LeavingSheet changes={release.changes} />}
    </>,
    document.body,
  )
}
