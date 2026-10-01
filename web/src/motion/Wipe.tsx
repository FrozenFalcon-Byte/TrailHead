import { motion, useScroll, useTransform } from 'motion/react'
import { useRef } from 'react'

/* Mile edges. The next section's top edge rises into a shape as it scrolls in, with an accent band
   just behind it and the mile tag riding the peak, then flattens into a straight seam by the time it
   nears the top of the screen. They add no scroll length, so content arrives as soon as you reach it.
   Each mile has its own edge:
   chevron  a roof that points up the trail
   arc      a single round hill
   pillars  rounded bars of different heights
   teeth    a row of sharp triangles
   slant    one long diagonal
   peaks    twin arrow tips
   wave     a rolling sine wave */

export type EdgeKind = 'chevron' | 'arc' | 'pillars' | 'teeth' | 'slant' | 'peaks' | 'wave'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

// Paths on a 100 x 10 box: y = 10 is the flat seam at the section's top, y = 0 the highest peak.
const wave = () => {
  let d = 'M0 10 L0 5'
  for (let x = 0; x <= 100; x += 2) d += ` L${x} ${(5 - 4.6 * Math.sin((x / 100) * Math.PI * 3)).toFixed(2)}`
  return `${d} L100 10 Z`
}
const pillars = () => {
  const hs = [6, 9.5, 4, 10, 7, 5, 8.5]
  const w = 100 / hs.length
  let d = 'M0 10'
  hs.forEach((h, i) => {
    const x0 = i * w
    const x1 = x0 + w
    const y = 10 - h
    d += ` L${x0} ${y + 1.4} Q${x0} ${y} ${x0 + 1.4} ${y} L${x1 - 1.4} ${y} Q${x1} ${y} ${x1} ${y + 1.4}`
  })
  return `${d} L100 10 Z`
}
const teeth = () => {
  let d = 'M0 10 L0 6'
  for (let i = 0; i < 10; i++) d += ` L${i * 10 + 5} 0 L${i * 10 + 10} 6`
  return `${d} L100 10 Z`
}
const EDGES: Record<EdgeKind, { d: string; peak: number }> = {
  chevron: { d: 'M0 10 L0 7 L50 0 L100 7 L100 10 Z', peak: 50 },
  arc: { d: 'M0 10 L0 9 Q50 -9 100 9 L100 10 Z', peak: 50 },
  pillars: { d: pillars(), peak: 50 },
  teeth: { d: teeth(), peak: 45 },
  slant: { d: 'M0 10 L0 0 L100 8.5 L100 10 Z', peak: 14 },
  peaks: { d: 'M0 10 L0 6 L25 0 L50 6 L75 0 L100 6 L100 10 Z', peak: 75 },
  wave: { d: wave(), peak: 17 },
}

export function MileEdge({ kind, to, accent, label }: { kind: EdgeKind; to: string; accent: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'start 0.2'] })
  // Rise while the seam climbs the lower half of the screen, flatten over the upper half.
  const env = (lead: number) => (v: number) => smooth(0, 0.32 + lead, v) * (1 - smooth(0.5 + lead, 1, v))
  const fill = useTransform(p, env(0))
  const back = useTransform(p, (v) => env(0.08)(v) * 1.3)
  const tag = useTransform(p, (v) => smooth(0.12, 0.34, v) * (1 - smooth(0.55, 0.85, v)))
  const tagB = useTransform(fill, (f) => `${(f * 100).toFixed(1)}%`)
  const { d, peak } = EDGES[kind]
  return (
    <div ref={ref} className="l-edge" aria-hidden>
      <div className="l-edge__art">
        <motion.svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ scaleY: back, originY: 1 }}>
          <path d={d} fill={accent} />
        </motion.svg>
        <motion.svg viewBox="0 0 100 10" preserveAspectRatio="none" style={{ scaleY: fill, originY: 1 }}>
          <path d={d} fill={to} />
        </motion.svg>
        <motion.span className="tag l-edge__tag" style={{ left: `${peak}%`, bottom: tagB, opacity: tag, scale: useTransform(tag, (t) => 0.6 + 0.4 * t) }}>
          {label}
        </motion.span>
      </div>
    </div>
  )
}
