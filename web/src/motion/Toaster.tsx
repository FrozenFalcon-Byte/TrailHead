import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { usePrefs } from '../lib/prefs'
import { dismiss, useToasts, type Toast, type Tone } from '../lib/toast'
import { Shape, type Glyph, type ShapeKind } from './Shapes'

/* Toasts in the trail's shape language: each tone gets its story shape, pastel or solid card, and a fuse along
   the bottom that burns down. Hovering holds it; flicking it sideways throws it away. */

const LOOK: Record<Tone, { kind: ShapeKind; glyph: Glyph; color: string; pastel: string }> = {
  success: { kind: 'circle', glyph: 'check', color: 'var(--green)', pastel: 'var(--mint)' },
  error: { kind: 'tag', glyph: 'signal', color: 'var(--orange)', pastel: 'var(--peach)' },
  warn: { kind: 'square', glyph: 'pr', color: 'var(--yellow)', pastel: 'var(--butter)' },
  info: { kind: 'circle', glyph: 'flag', color: 'var(--blue)', pastel: 'var(--sky)' },
  job: { kind: 'square', glyph: 'branch', color: 'var(--violet)', pastel: 'var(--lilac)' },
}

const ENTER = {
  drop: (top: boolean, left: boolean) => ({ opacity: 0, y: top ? -40 : 40, scale: 0.86, rotate: left ? 3 : -3 }),
  flip: (top: boolean) => ({ opacity: 0, rotateX: top ? 80 : -80, y: top ? -10 : 10 }),
  slide: (_: boolean, left: boolean) => ({ opacity: 0, x: left ? -120 : 120 }),
  stamp: () => ({ opacity: 0, scale: 1.6, rotate: -6 }),
}

function Item({ t, fromTop, fromLeft }: { t: Toast; fromTop: boolean; fromLeft: boolean }) {
  const p = usePrefs()
  const look = LOOK[t.tone]
  const fuse = useAnimationControls()
  const [held, setHeld] = useState(false)
  const left = useRef(t.ttl * 1000)
  const started = useRef(0)

  useEffect(() => {
    if (!t.ttl) return
    if (held && p.toastHoldOnHover) {
      left.current -= performance.now() - started.current
      fuse.stop()
      return
    }
    started.current = performance.now()
    fuse.start({ scaleX: 0, transition: { duration: Math.max(0.05, left.current / 1000), ease: 'linear' } })
    const id = window.setTimeout(() => dismiss(t.id), Math.max(50, left.current))
    return () => window.clearTimeout(id)
  }, [held, t.id, t.ttl, fuse, p.toastHoldOnHover])

  return (
    <motion.li
      layout
      className={`toast is-${p.toastStyle} is-${p.toastSize}`}
      style={{ ['--tone' as string]: look.color, ['--tone-bg' as string]: look.pastel }}
      initial={ENTER[p.toastEntrance](fromTop, fromLeft)}
      animate={{ opacity: 1, y: 0, x: 0, scale: 1, rotate: 0, rotateX: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: fromLeft ? -60 : 60, transition: { duration: 0.28, ease: [0.76, 0, 0.24, 1] } }}
      transition={p.toastEntrance === 'stamp' ? { type: 'spring', stiffness: 600, damping: 22 } : { type: 'spring', stiffness: 380, damping: 28 }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.6}
      onDragEnd={(_, info) => Math.abs(info.offset.x) > 90 && dismiss(t.id)}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      role={t.tone === 'error' ? 'alert' : 'status'}
    >
      {p.toastIcons && <motion.span className="toast__icon" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.08 }}>
        <Shape kind={look.kind} color={look.color} glyph={look.glyph} size={p.toastSize === 'compact' ? 26 : 34} />
      </motion.span>}
      <span className="toast__copy">
        <b>{t.title}</b>
        {t.body && <span>{t.body}</span>}
      </span>
      {t.action && (
        <button
          className="toast__action"
          onClick={() => {
            t.action?.run()
            dismiss(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">×</button>
      {t.ttl > 0 && p.toastFuse && <motion.span className="toast__fuse" initial={{ scaleX: 1 }} animate={fuse} />}
    </motion.li>
  )
}

export function Toaster() {
  const items = useToasts()
  const p = usePrefs()
  const fromTop = p.toastPosition.startsWith('top')
  const fromLeft = p.toastPosition.endsWith('left')
  const list = fromTop ? [...items].reverse() : items
  return (
    <ol className={`toaster at-${p.toastPosition}`} aria-live="polite">
      <AnimatePresence initial={false}>
        {list.map((t) => <Item key={t.id} t={t} fromTop={fromTop} fromLeft={fromLeft} />)}
      </AnimatePresence>
    </ol>
  )
}
