import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from 'motion/react'
import { forwardRef, useEffect, useRef, useState } from 'react'
import { clearTraffic, deviceName, onPairEvent, onPairMessage, PAIR_PAGES, pagePath, usePair, type Traffic } from '../lib/pair'
import { EASE, KIND_COLOR, KIND_LABEL, SPRING, UseArt } from './pairParts'

/* The phone in the desktop scene, drawn as an iPhone: a frame with its side buttons, a status bar, a Dynamic Island
   that opens like a Live Activity for whatever passes between the two devices, and a screen that is a small copy of
   the real remote (keys, the dark pad with its orange cursor, the yellow buzz key) lighting up as the real one is used.
   Things passed across leave the island and arc into the window, or arc out of the window into the island. */

type Act = { id: number; kind: string; label: string }

const ACT_LABEL: Record<string, string> = { go: 'Steering', tap: 'Pressed', menu: 'Right click', ask: 'Asking', drop: 'Passing', ring: 'Buzz', scroll: 'Scrolling' }

/** The island: a pill that swells into a Live Activity when something happens, and holds "No signal" while lost. */
export const Island = forwardRef<HTMLDivElement, { lost: boolean; waiting: boolean }>(function Island({ lost, waiting }, ref) {
  const pair = usePair()
  const [act, setAct] = useState<Act | null>(null)
  const seen = useRef(0)
  useEffect(() => {
    const t = pair.traffic[pair.traffic.length - 1]
    if (!t || t.id === seen.current) return
    seen.current = t.id
    setAct({ id: t.id, kind: t.kind, label: `${ACT_LABEL[t.kind] ?? KIND_LABEL[t.kind] ?? 'Passing'}${t.dir === 'out' ? ' ↓' : ''}` })
  }, [pair.traffic])
  useEffect(
    () =>
      onPairEvent((e) => {
        if (e.kind === 'linked' || e.kind === 'relinked') setAct({ id: Date.now(), kind: 'link', label: `Linked · ${deviceName()}` })
      }),
    [],
  )
  useEffect(() => {
    if (!act) return
    const t = window.setTimeout(() => setAct(null), act.kind === 'link' ? 2600 : 1600)
    return () => window.clearTimeout(t)
  }, [act])
  const open = act || lost
  const color = act ? (act.kind === 'link' ? 'var(--green)' : KIND_COLOR[act.kind] ?? 'var(--yellow)') : 'var(--stop)'
  return (
    <motion.div
      ref={ref}
      className="pr-island"
      initial={false}
      animate={{ width: open ? '78cqw' : '31cqw', height: act ? '14cqw' : '9cqw', borderRadius: act ? '7cqw' : '4.5cqw' }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <i className={`pr-island__cam ${waiting ? 'is-on' : ''}`} />
      <AnimatePresence mode="popLayout" initial={false}>
        {open && (
          <motion.span key={act ? act.id : 'lost'} className="pr-island__act" initial={{ scale: 0.4, y: 6 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.3, transition: { duration: 0.14 } }} transition={{ ...SPRING, delay: 0.08 }}>
            <span className="pr-island__dot" style={{ background: color }}>
              {act && act.kind !== 'link' && <UseArt kind={act.kind === 'point' ? 'tap' : act.kind} />}
            </span>
            <b>{act ? act.label : 'No signal'}</b>
            <span className="pr-island__wave" aria-hidden>
              {[0, 1, 2, 3].map((k) => (
                <motion.i key={k} style={{ background: color }} animate={act ? { scaleY: [0.3, 1, 0.3] } : { scaleY: 0.3 }} transition={{ duration: 0.5, repeat: act ? Infinity : 0, delay: k * 0.09 }} />
              ))}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  )
})

export function StatusBar({ lost }: { lost: boolean }) {
  return (
    <div className="pr-status">
      <b>9:41</b>
      <span className="pr-status__icons">
        <svg viewBox="0 0 18 12" aria-hidden>
          {[0, 1, 2, 3].map((k) => <rect key={k} x={k * 4.6} y={9 - k * 2.6} width={3.2} height={3 + k * 2.6} rx={0.9} opacity={lost && k > 0 ? 0.3 : 1} />)}
        </svg>
        <svg viewBox="0 0 26 12" aria-hidden>
          <rect x={0.75} y={0.75} width={21.5} height={10.5} rx={3} fill="none" strokeWidth={1.5} stroke="currentColor" opacity={0.45} />
          <rect x={2.5} y={2.5} width={15} height={7} rx={1.6} />
          <path d="M24 4.2 V7.8" strokeWidth={1.6} strokeLinecap="round" stroke="currentColor" opacity={0.45} />
        </svg>
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- the screen once linked */

const KEY_BG = ['var(--sky)', 'var(--lilac)', 'var(--mint)', 'var(--peach)', 'var(--limeade)', 'var(--butter)', 'var(--lilac)', 'var(--mint)']

/** A small copy of the real remote that lights up with what the real one does. */
export function MiniRemote({ lost, peer }: { lost: boolean; peer: string }) {
  const pair = usePair()
  const [lit, setLit] = useState<{ part: string; id: number } | null>(null)
  const [taps, setTaps] = useState<number[]>([])
  const cx = useMotionValue(50)
  const cy = useMotionValue(50)
  const sx = useSpring(cx, { stiffness: 300, damping: 28 })
  const sy = useSpring(cy, { stiffness: 300, damping: 28 })
  const left = useTransform(sx, (v) => `${v}%`)
  const top = useTransform(sy, (v) => `${v}%`)
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t === 'point') {
          cx.set(Math.max(8, Math.min(92, cx.get() + m.dx * 0.12)))
          cy.set(Math.max(10, Math.min(90, cy.get() + m.dy * 0.12)))
          return
        }
        if (m.t === 'tap') setTaps((l) => [...l.slice(-2), Date.now()])
        const part = m.t === 'go' ? `go:${pagePath(m.to)}` : m.t
        setLit({ part, id: Date.now() })
      }),
    [cx, cy],
  )
  useEffect(() => {
    if (!lit) return
    const t = window.setTimeout(() => setLit(null), 650)
    return () => window.clearTimeout(t)
  }, [lit])
  const page = pagePath(pair.page || '')
  return (
    <motion.div className={`pr-mini ${lost ? 'is-lost' : ''}`} initial={{ clipPath: 'inset(100% 0 0 0)' }} animate={{ clipPath: 'inset(0% 0 0 0)', transitionEnd: { clipPath: 'none' } }} exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.35 } }} transition={{ duration: 0.55, ease: EASE, delay: 0.35 }}>
      <motion.div className="pr-mini__head" animate={lit && (lit.part === 'ask' || lit.part === 'drop') ? { scale: [1, 1.06, 1] } : { scale: 1 }} transition={{ duration: 0.4 }}>
        <small>{lost ? 'Lost sight of' : 'Linked to'}</small>
        <b>{deviceName()}</b>
        <span className="pr-mini__beads" aria-hidden>
          {['var(--orange)', 'var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--violet)'].map((c, k) => (
            <motion.i key={k} style={{ background: lost ? 'var(--stop)' : c }} animate={lost ? { y: 3 } : { y: [0, -2.5, 0] }} transition={lost ? SPRING : { duration: 1.1, repeat: Infinity, delay: k * 0.1 }} />
          ))}
        </span>
      </motion.div>
      <div className="pr-mini__keys">
        {PAIR_PAGES.map((p, i) => {
          const on = page === p.to
          const flash = lit?.part === `go:${p.to}`
          return (
            <motion.span key={p.to} className={on ? 'is-on' : ''} style={{ background: on ? 'var(--solid)' : KEY_BG[i] }} initial={{ scale: 0, rotate: i % 2 ? 14 : -14 }} animate={{ scale: flash ? 1.25 : 1, rotate: 0, y: flash ? -3 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14, delay: lit ? 0 : 0.6 + i * 0.04 }}>
              <svg viewBox="0 0 24 24" aria-hidden><path d={p.glyph} /></svg>
            </motion.span>
          )
        })}
      </div>
      <motion.div className="pr-mini__pad" initial={{ scale: 0.6, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.85 }}>
        <motion.i className="pr-mini__cursor" style={{ left, top }} />
        {taps.map((id) => (
          <motion.b key={id} className="pr-mini__tap" style={{ left, top }} initial={{ scale: 0.2, borderWidth: 6 }} animate={{ scale: 2.4, borderWidth: 0 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} onAnimationComplete={() => setTaps((l) => l.filter((x) => x !== id))} />
        ))}
      </motion.div>
      <motion.div className="pr-mini__buzz" animate={lit?.part === 'ring' ? { x: [0, -4, 4, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.45 }}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z M10 21 H14" /></svg>
        Buzz {peer || 'Mac'}
      </motion.div>
    </motion.div>
  )
}

/* ---------------------------------------------------------------- hops between phone and window */

/** One thing passed across, arcing from the island into the window bar or the other way, landing with a bump. */
export function StageHop({ t, stage, island, win }: { t: Traffic; stage: React.RefObject<HTMLDivElement | null>; island: React.RefObject<HTMLDivElement | null>; win: React.RefObject<HTMLDivElement | null> }) {
  const [path] = useState(() => {
    const s = stage.current?.getBoundingClientRect()
    const a = island.current?.getBoundingClientRect()
    const b = win.current?.getBoundingClientRect()
    if (!s || !a || !b) return null
    const phone = { x: a.left + a.width / 2 - s.left, y: a.top + a.height / 2 - s.top }
    const screen = { x: b.right - s.left - 60, y: b.top - s.top + 20 }
    return t.dir === 'in' ? { from: phone, to: screen } : { from: screen, to: phone }
  })
  useEffect(() => {
    if (!path) clearTraffic(t.id)
  }, [path, t.id])
  if (!path) return null
  const { from, to } = path
  const peak = Math.min(from.y, to.y) - 90
  return (
    <motion.span
      className="pr-shop"
      style={{ background: KIND_COLOR[t.kind] ?? 'var(--ink)' }}
      initial={{ x: from.x, y: from.y, scale: 0 }}
      animate={{ x: [from.x, (from.x + to.x) / 2, to.x], y: [from.y, peak, to.y], scale: [0, 1.15, 0.5], rotate: t.dir === 'in' ? [0, -14, 10] : [0, 14, -10] }}
      transition={{ duration: 0.95, times: [0, 0.45, 1], ease: [0.45, 0, 0.25, 1] }}
      onAnimationComplete={() => {
        const target = t.dir === 'in' ? win.current : island.current?.closest('.pr-phone__body')
        target?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.035) rotate(-0.6deg)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
        clearTraffic(t.id)
      }}
      aria-hidden
    >
      <UseArt kind={t.kind === 'point' ? 'tap' : t.kind} />
      <b>{KIND_LABEL[t.kind] ?? t.kind}</b>
    </motion.span>
  )
}
