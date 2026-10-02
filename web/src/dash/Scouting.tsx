import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'

/* While a tour is being planned: a strip of trail country where a marker walks from camp to camp as each step
   finishes (navigate, gather, judge, order), raising a flag at every camp it reaches. Files Jev is weighing drop
   in as pins beside the trail. The placeholder stops underneath share layout ids with the real stops, so when
   the tour lands they turn into it instead of being swapped out. */

const W = 1000
const H = 190
const CAMPS: [number, number][] = [[90, 136], [360, 84], [640, 130], [910, 78]]
const TRAIL = 'M-20 150 C 30 146, 50 140, 90 136 C 170 128, 260 80, 360 84 C 460 88, 540 136, 640 130 C 740 124, 820 80, 910 78 C 960 77, 990 72, 1020 70'
const TREES: [number, number, number, boolean][] = [
  [30, 104, 0.9, true], [52, 96, 0.7, false], [180, 168, 1, true], [214, 172, 0.8, true], [250, 58, 0.8, false], [282, 52, 0.95, true],
  [470, 150, 1, true], [500, 158, 0.75, false], [536, 70, 0.85, true], [760, 172, 1, true], [792, 168, 0.8, false], [980, 120, 1, true], [956, 128, 0.7, true],
]
const PEAKS: [number, number, number][] = [[600, 70, 120], [690, 54, 150], [770, 78, 110], [150, 62, 110], [215, 74, 90]]

export function Scouting({ stage, labels, pins }: { stage: number; labels: string[]; pins: string[] }) {
  const reduce = useReducedMotion()
  const path = useRef<SVGPathElement>(null)
  const [stops, setStops] = useState<number[]>([0.08, 0.36, 0.64, 0.92])
  const [walker, setWalker] = useState<[number, number]>(CAMPS[0])
  const [len, setLen] = useState(1)
  const prog = useMotionValue(0)
  const mask = `sc-${useId().replace(/:/g, '')}`

  // Where along the trail each camp sits, as a fraction of its length.
  useLayoutEffect(() => {
    const el = path.current
    if (!el) return
    const total = el.getTotalLength()
    setLen(total)
    setStops(CAMPS.map(([cx, cy]) => {
      let best = 0
      let bestD = Infinity
      for (let i = 0; i <= 400; i++) {
        const p = el.getPointAtLength((i / 400) * total)
        const d = Math.hypot(p.x - cx, p.y - cy)
        if (d < bestD) { bestD = d; best = i / 400 }
      }
      return best
    }))
  }, [])
  useEffect(() => {
    const target = stops[Math.min(stops.length - 1, stage)]
    const c = animate(prog, target, { duration: reduce ? 0 : 1.6, ease: [0.5, 0, 0.3, 1] })
    return () => c.stop()
  }, [stage, stops, prog, reduce])
  useMotionValueEvent(prog, 'change', (v) => {
    const el = path.current
    if (!el) return
    const p = el.getPointAtLength(v * len)
    setWalker([p.x, p.y])
  })

  // Pins sit beside the trail between the second and third camps, alternating sides.
  const pinAt = (i: number, n: number): [number, number] => {
    const el = path.current
    if (!el) return [0, 0]
    const f = stops[1] + ((stops[2] - stops[1]) * (i + 0.5)) / Math.max(1, n)
    const p = el.getPointAtLength(f * len)
    return [p.x, p.y + (i % 2 ? 30 : -18)]
  }
  const shown = pins.slice(0, 9)

  return (
    <div className="sc">
      <svg viewBox={`0 0 ${W} ${H}`} className="sc-svg" aria-hidden>
        {PEAKS.map(([x, y, w], i) => (
          <g key={i}>
            <path d={`M${x - w / 2} 150 L${x} ${y} L${x + w / 2} 150 Z`} className="tm-peak" />
            <path d={`M${x} ${y} L${x + w / 2} 150 L${x + w * 0.06} 150 Z`} className="tm-peak__shade" />
            <path d={`M${x - w * 0.12} ${y + 22} L${x} ${y} L${x + w * 0.12} ${y + 22} L${x + 3} ${y + 15} L${x - 4} ${y + 24} Z`} className="tm-peak__snow" />
            <path d={`M${x - w / 2} 150 L${x} ${y} L${x + w / 2} 150`} className="tm-peak__line" />
          </g>
        ))}
        <path d="M0 150 C 200 140, 400 160, 600 148 S 900 140, 1000 150 V190 H0 Z" className="sc-ground" />
        {TREES.map(([x, y, s, pine], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g className="tm-tree" style={{ animationDelay: `${i * -0.37}s` }}>
              <path d="M0 1 V-6" className="tm-tree__trunk" />
              {pine ? <path d="M0 -26 L7 -15 H4 L9 -6 H-9 L-4 -15 H-7 Z" className="tm-tree__pine" /> : <circle cy={-13} r={8.5} className="tm-tree__round" />}
            </g>
          </g>
        ))}

        <mask id={mask} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
          <motion.path d={TRAIL} stroke="#fff" strokeWidth={14} fill="none" style={{ pathLength: prog }} />
        </mask>
        <path ref={path} d={TRAIL} className="tm-trail__ghost" />
        <path d={TRAIL} className="tm-trail" mask={`url(#${mask})`} />

        {shown.map((p, i) => {
          const [x, y] = pinAt(i, shown.length)
          return (
            <motion.g key={p} initial={reduce ? false : { y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 15, delay: i * 0.08 }}>
              <title>{p}</title>
              <path d={`M${x} ${y} C${x - 2} ${y - 5} ${x - 7} ${y - 8} ${x - 7} ${y - 13} A7 7 0 1 1 ${x + 7} ${y - 13} C${x + 7} ${y - 8} ${x + 2} ${y - 5} ${x} ${y} Z`} className="tm-pin__head" style={{ fill: i % 3 === 0 ? 'var(--orange)' : i % 3 === 1 ? 'var(--blue)' : 'var(--violet)' }} />
              <circle cx={x} cy={y - 13} r={2.4} className="tm-pin__dot" />
            </motion.g>
          )
        })}

        {CAMPS.map(([x, y], i) => {
          const reached = stage > i
          const here = stage === i
          return (
            <g key={i} className={`sc-camp ${reached ? 'is-done' : ''} ${here ? 'is-here' : ''}`}>
              <ellipse cx={x} cy={y + 2} rx={16} ry={5} className="sc-camp__base" />
              <path d={`M${x} ${y} V${y - 34}`} className="tm-flag__pole" />
              <motion.path
                d={`M${x} ${y - 34} L${x + 20} ${y - 28} L${x} ${y - 22} Z`}
                className="sc-camp__flag"
                initial={false}
                animate={{ y: reached ? 0 : 20, scaleX: reached ? 1 : 0.4 }}
                transition={{ type: 'spring', stiffness: 260, damping: 13 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
              />
              <text x={x} y={y + 24} className="sc-camp__label">{labels[i]}</text>
            </g>
          )
        })}

        <g transform={`translate(${walker[0]} ${walker[1]})`} className="sc-walker">
          <circle r={14} className="sc-walker__ring" />
          <g className="sc-walker__bob">
            <circle r={8} className="sc-walker__dot" />
            <circle r={3} className="sc-walker__eye" />
          </g>
        </g>
      </svg>
    </div>
  )
}

/** Placeholder stops shown while scouting. Each shares a layout id with the real stop at the same position. */
export function ScoutStops({ count }: { count: number }) {
  return (
    <div className="d-stops">
      {Array.from({ length: count }, (_, i) => (
        <motion.article key={i} layoutId={`stop-${i}`} className="d-stop is-scout" transition={{ type: 'spring', stiffness: 260, damping: 28 }}>
          <div className="d-stop__head">
            <span className="d-stop__n">{i + 1}</span>
            <span className="d-stop__text">
              <span className="sc-line" style={{ width: `${46 + ((i * 17) % 30)}%`, animationDelay: `${i * 0.25}s` }} />
              <span className="sc-line is-thin" style={{ width: `${28 + ((i * 11) % 20)}%`, animationDelay: `${i * 0.25 + 0.15}s` }} />
            </span>
          </div>
        </motion.article>
      ))}
    </div>
  )
}
