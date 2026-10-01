import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { Shape, STORY } from './Shapes'

/* Mile transitions. Each is a pinned stretch of scroll that hands one backdrop over to the next, and each
   mile gets its own move so the page never repeats itself:
   chevron  trail-sign bands sweep across and out the other side
   iris     a circle opens from the centre around a story shape
   shutters rounded pillars rise through the screen and carry on out the top
   tiles    a wave of circles and squares grows across the screen, diagonally
   stripes  bands slide in from alternating sides
   doors    two arrow-edged panels slam together, then part up and down
   ripple   rings spread up from the bottom edge */

export type WipeKind = 'chevron' | 'iris' | 'shutters' | 'tiles' | 'stripes' | 'doors' | 'ripple'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const ACCENTS = ['var(--violet)', 'var(--lime)', 'var(--orange)', 'var(--yellow)', 'var(--blue)', 'var(--green)']

export function MileWipe({ kind, from, to, label, colors = ACCENTS }: { kind: WipeKind; from: string; to: string; label: string; colors?: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  // Wipes that pass through (chevron, shutters, doors) swap the backdrop while the screen is covered;
  // the rest end fully covered in the next colour.
  const bg = useTransform(p, (v) => (v < 0.5 ? from : kind === 'chevron' || kind === 'shutters' || kind === 'doors' ? to : from))
  const Body = BODIES[kind]
  return (
    <div ref={ref} className={`l-wipe is-${kind}`} aria-hidden>
      <motion.div className="l-wipe__stage" style={{ background: bg }}>
        <Body p={p} to={to} colors={colors} />
        <Label p={p} kind={kind} text={label} />
      </motion.div>
    </div>
  )
}

type BodyProps = { p: MotionValue<number>; to: string; colors: string[] }

function Label({ p, kind, text }: { p: MotionValue<number>; kind: WipeKind; text: string }) {
  const [a, b] = kind === 'chevron' ? [0.3, 0.62] : kind === 'doors' ? [0.3, 0.55] : [0.38, 0.86]
  const t = useTransform(p, (v) => smooth(a - 0.08, a + 0.02, v) * (1 - smooth(b, b + 0.1, v)))
  const y = useTransform(p, (v) => `${((1 - smooth(a - 0.08, a + 0.02, v)) * 60 - smooth(b, b + 0.1, v) * 60).toFixed(1)}%`)
  return (
    <div className="l-wipe__label-wrap">
      <motion.span className="display l-wipe__label" style={{ opacity: t, y, scale: useTransform(t, (x) => 0.8 + 0.2 * x) }}>
        {text}
      </motion.span>
    </div>
  )
}

/* ---------- chevron ---------- */
function Chevron({ p, colors }: BodyProps) {
  const set = colors.slice(0, 4)
  return <>{set.map((c, i) => <Band key={i} i={i} n={set.length} color={c} p={p} />)}</>
}
function Band({ i, n, color, p }: { i: number; n: number; color: string; p: MotionValue<number> }) {
  const lag = i * 0.05
  const x = useTransform(p, (v) => `${(-170 + smooth(0.04 + lag, 0.4 + lag * 0.5, v) * 155 + smooth(0.56 + lag * 0.6, 0.96, v) * 180).toFixed(3)}vw`)
  const h = 100 / n
  return <motion.div className="l-wipe__band" style={{ x, top: `${i * h - 0.5}%`, height: `${h + 1}%`, background: color, ['--tip' as string]: `${(h * 0.5).toFixed(2)}vh` }} />
}

/* ---------- iris ---------- */
function Iris({ p, to, colors }: BodyProps) {
  const lead = useTransform(p, (v) => `circle(${(smooth(0.04, 0.6, v) * 82).toFixed(2)}% at 50% 50%)`)
  const main = useTransform(p, (v) => `circle(${(smooth(0.14, 0.78, v) * 82).toFixed(2)}% at 50% 50%)`)
  const s = useTransform(p, (v) => smooth(0.02, 0.3, v) * (1 - smooth(0.62, 0.8, v)))
  const r = useTransform(p, (v) => (1 - smooth(0.02, 0.3, v)) * -180 + smooth(0.62, 0.8, v) * 120)
  const st = STORY[1]
  return (
    <>
      <motion.div className="l-wipe__fill" style={{ background: colors[0], clipPath: lead }} />
      <motion.div className="l-wipe__fill" style={{ background: to, clipPath: main }} />
      <motion.div className="l-wipe__hero-shape" style={{ scale: s, rotate: r }}>
        <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
      </motion.div>
    </>
  )
}

/* ---------- shutters ---------- */
function Shutters({ p, colors }: BodyProps) {
  const n = 6
  return (
    <div className="l-wipe__row">
      {Array.from({ length: n }, (_, i) => <Pillar key={i} i={i} n={n} color={colors[i % colors.length]} p={p} />)}
    </div>
  )
}
function Pillar({ i, n, color, p }: { i: number; n: number; color: string; p: MotionValue<number> }) {
  const lag = (Math.abs(i - (n - 1) / 2) / n) * 0.16
  const y = useTransform(p, (v) => `${(105 - smooth(0.04 + lag, 0.42 + lag * 0.4, v) * 105 - smooth(0.56 + lag * 0.4, 0.95, v) * 115).toFixed(2)}%`)
  return <motion.span className="l-wipe__pillar" style={{ y, background: color }} />
}

/* ---------- tiles ---------- */
const TC = 10
const TR = 6
function Tiles({ p, to, colors }: BodyProps) {
  return (
    <div className="l-wipe__grid" style={{ gridTemplateColumns: `repeat(${TC}, 1fr)`, gridTemplateRows: `repeat(${TR}, 1fr)` }}>
      {Array.from({ length: TC * TR }, (_, k) => <Tile key={k} k={k} p={p} to={to} accent={colors[k % colors.length]} />)}
    </div>
  )
}
function Tile({ k, p, to, accent }: { k: number; p: MotionValue<number>; to: string; accent: string }) {
  const c = k % TC
  const r = Math.floor(k / TC)
  const d = (c + r) / (TC + TR - 2)
  const a = useTransform(p, (v) => smooth(0.03 + d * 0.4, 0.2 + d * 0.4, v) * 1.6)
  const b = useTransform(p, (v) => smooth(0.16 + d * 0.48, 0.34 + d * 0.48, v) * 1.6)
  const round = (c + r) % 2 ? '50%' : '22%'
  return (
    <span className="l-wipe__cell">
      <motion.i style={{ scale: a, background: accent, borderRadius: round, rotate: useTransform(a, (x) => (1.6 - x) * 60) }} />
      <motion.i style={{ scale: b, background: to, borderRadius: round }} />
    </span>
  )
}

/* ---------- stripes ---------- */
function Stripes({ p, to, colors }: BodyProps) {
  const n = 5
  return (
    <>
      {Array.from({ length: n }, (_, i) => <Stripe key={`a${i}`} i={i} n={n} p={p} color={colors[(i + 2) % colors.length]} start={0.04} />)}
      {Array.from({ length: n }, (_, i) => <Stripe key={`b${i}`} i={i} n={n} p={p} color={to} start={0.3} />)}
    </>
  )
}
function Stripe({ i, n, p, color, start }: { i: number; n: number; p: MotionValue<number>; color: string; start: number }) {
  const dir = i % 2 ? 1 : -1
  const x = useTransform(p, (v) => `${(dir * (1 - smooth(start + i * 0.05, start + 0.3 + i * 0.05, v)) * 105).toFixed(2)}%`)
  const h = 100 / n
  return <motion.span className="l-wipe__stripe" style={{ x, top: `${i * h - 0.3}%`, height: `${h + 0.6}%`, background: color, borderRadius: dir > 0 ? '999px 0 0 999px' : '0 999px 999px 0' }} />
}

/* ---------- doors ---------- */
function Doors({ p, colors }: BodyProps) {
  const close = (v: number) => smooth(0.05, 0.36, v)
  const open = (v: number) => smooth(0.58, 0.95, v)
  const lx = useTransform(p, (v) => `${(-102 + close(v) * 102).toFixed(2)}%`)
  const rx = useTransform(p, (v) => `${(102 - close(v) * 102).toFixed(2)}%`)
  const ly = useTransform(p, (v) => `${(-open(v) * 105).toFixed(2)}%`)
  const ry = useTransform(p, (v) => `${(open(v) * 105).toFixed(2)}%`)
  return (
    <>
      <motion.div className="l-wipe__door is-left" style={{ x: lx, y: ly, background: colors[0] }} />
      <motion.div className="l-wipe__door is-right" style={{ x: rx, y: ry, background: colors[2] }} />
    </>
  )
}

/* ---------- ripple ---------- */
function Ripple({ p, to, colors }: BodyProps) {
  const rings = [colors[3], colors[4], colors[1], to]
  return <>{rings.map((c, i) => <Ring key={i} i={i} p={p} color={c} />)}</>
}
function Ring({ i, p, color }: { i: number; p: MotionValue<number>; color: string }) {
  const clipPath = useTransform(p, (v) => `circle(${(smooth(0.04 + i * 0.1, 0.5 + i * 0.1, v) * 125).toFixed(2)}% at 50% 100%)`)
  return <motion.div className="l-wipe__fill" style={{ background: color, clipPath }} />
}

const BODIES: Record<WipeKind, (props: BodyProps) => ReactNode> = {
  chevron: Chevron,
  iris: Iris,
  shutters: Shutters,
  tiles: Tiles,
  stripes: Stripes,
  doors: Doors,
  ripple: Ripple,
}
