import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef } from 'react'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'

/* The opening statement: a big sentence with the story's shapes dropped into it, inked word by word as you
   scroll, while trail-sign chevrons slide in from the left edge. */

type Token = string | { kind: ShapeKind; color: string; glyph: Glyph }
const LINES: Token[][] = [
  ['673', { kind: 'circle', color: 'var(--violet)', glyph: 'folder' }, 'files.'],
  ['11,551', { kind: 'square', color: 'var(--yellow)', glyph: 'pr' }, 'commits.'],
  ['One', { kind: 'tag', color: 'var(--orange)', glyph: 'grep' }, 'question,'],
  ['and the', { kind: 'square', color: 'var(--green)', glyph: 'file' }, 'one file'],
  ['you actually need.'],
]

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function Statement() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.6'] })
  const total = LINES.flat().length
  let k = 0
  const a = useTransform(p, (v) => `${(-100 + clamp01(v * 2.2) * 100).toFixed(2)}%`)
  const b = useTransform(p, (v) => `${(-100 + clamp01(v * 2.2 - 0.25) * 100).toFixed(2)}%`)
  const c = useTransform(p, (v) => `${(-100 + clamp01(v * 2.2 - 0.5) * 100).toFixed(2)}%`)
  return (
    <section ref={ref} id="story" className="l-state t-cream">
      <div className="l-state__chevrons" aria-hidden>
        <motion.span style={{ x: a, background: 'var(--orange)' }} />
        <motion.span style={{ x: b, background: 'var(--violet)' }} />
        <motion.span style={{ x: c, background: 'var(--yellow)' }} />
      </div>
      <div className="l-state__inner">
        <p className="l-state__kicker body">Here’s the thing about a new codebase:</p>
        <h2 className="display l-state__text">
          {LINES.map((line, li) => (
            <span key={li} className="l-state__line">
              {line.map((t) => {
                const at = k++ / total
                return <Ink key={at} token={t} p={p} at={at} span={1 / total} />
              })}
            </span>
          ))}
        </h2>
      </div>
    </section>
  )
}

function Ink({ token, p, at, span }: { token: Token; p: MotionValue<number>; at: number; span: number }) {
  const t = useTransform(p, (v) => clamp01((v - at * 0.9) / (span * 1.6)))
  const color = useTransform(t, (x) => `color-mix(in srgb, var(--ink) ${(18 + x * 82).toFixed(1)}%, transparent)`)
  const scale = useTransform(t, (x) => 0.2 + 0.8 * Math.min(1, x * 1.4))
  const rotate = useTransform(t, (x) => (1 - x) * -40)
  if (typeof token === 'string') return <motion.span style={{ color }}>{token} </motion.span>
  return (
    <motion.span className="l-state__shape" style={{ scale, rotate }}>
      <Shape kind={token.kind} color={token.color} glyph={token.glyph} size={0} style={{ height: '100%', width: 'auto' }} />
    </motion.span>
  )
}
