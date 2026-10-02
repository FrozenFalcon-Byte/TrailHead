import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, useState } from 'react'
import { useTheme } from '../lib/theme'
import { Shape } from '../motion/Shapes'
import { Odometer, TrailCaption } from './TrailText'

/* The opening of the field guide, told as one scroll-driven scene in a 1600×900 world. Scrolling builds the
   landscape a piece at a time: the ridges and the mountain rise, a river runs down from a spring, a forest grows
   along it, then the trail is drawn from the trailhead to the summit and the flag walks it. Each piece stands for a
   part of the project, and the caption says which. Everything is scrubbed by scroll, so it plays both ways. */

const MOUNTAIN = 'M250 900 L600 500 L700 548 L880 200 L1050 480 L1130 440 L1520 900 Z'
const SHADE = 'M880 200 L1050 480 L1130 440 L1520 900 L980 900 Z'
const SNOW = 'M880 200 L815 330 L848 314 L874 342 L905 316 L957 330 Z'
const FAR = 'M-60 900 L-60 470 L120 380 L260 450 L400 360 L560 440 L700 400 L820 470 L1000 380 L1180 450 L1320 360 L1480 430 L1660 390 L1660 900 Z'
const MID = 'M-60 900 L-60 560 C 160 500, 300 540, 420 520 C 600 490, 700 560, 860 540 C 1060 510, 1200 560, 1360 520 C 1480 494, 1580 520, 1660 510 L1660 900 Z'
const MEADOW = 'M-60 960 L-60 720 C 180 680, 420 740, 640 706 C 900 668, 1100 742, 1300 700 C 1450 670, 1560 706, 1660 690 L1660 960 Z'
const TRAIL = 'M1230 872 C 1190 856, 1160 830, 1140 790 S 1200 712, 1110 660 S 960 640, 1000 580 S 1090 510, 1010 458 S 900 400, 944 334 S 896 246, 880 208'

const TREES: [number, number, number][] = [
  [60, 780, 1.2], [120, 820, 1], [210, 760, 0.9], [300, 800, 1.3], [360, 740, 0.85], [420, 860, 1.4], [520, 730, 0.9],
  [640, 742, 1], [700, 800, 1.2], [760, 870, 1.35], [860, 760, 0.95], [930, 820, 1.25], [1010, 760, 0.9], [1060, 880, 1.4],
  [1190, 740, 0.9], [1250, 800, 1.15], [1320, 760, 0.85], [1480, 760, 1], [1540, 820, 1.25], [1590, 740, 0.9],
  [640, 600, 0.7], [700, 640, 0.75], [1080, 560, 0.65], [1150, 600, 0.7], [1240, 660, 0.8], [560, 660, 0.75],
]
const SIGNALS: [number, number][] = [[0.3, 0], [0.55, 0], [0.8, 0]]

const BEATS = [
  { at: 0, n: 'A field guide', title: 'How Trailhead finds its way', body: 'Scroll to watch the trail get built. Each part of the picture is a part of the project.' },
  { at: 0.12, n: '01 · The mountain', title: 'A repository is a mountain you haven’t climbed', body: 'Scrapy alone has 673 files, 7,090 definitions and 11,551 commits. Too much to read from top to bottom.' },
  { at: 0.32, n: '02 · The river', title: 'Its history runs down it like a river', body: '8,087 issues and pull requests and 37,819 comments. That’s where the reasons behind the code are written down.' },
  { at: 0.52, n: '03 · The forest', title: 'Every file is a tree', body: 'Up close you only see trunks. Trailhead labels every file first, so it can read the forest like a map.' },
  { at: 0.7, n: '04 · The trail', title: 'Trailhead marks a path', body: 'Jev picks each turn, the LLM writes the signs, plain code decides the route, and every claim gets checked.' },
  { at: 0.9, n: '05 · The summit', title: 'Now walk it again, slowly', body: 'That was the whole trail. The rest of the guide walks it stop by stop, one stop for each part of the project. Keep scrolling.' },
]

/* The river is a filled ribbon, not a stroke: a meandering centreline that starts as a trickle at the spring and
   widens as it runs downhill, with a bank around it. A thick mask stroke along the centreline reveals it on scroll. */
const RIVER_PTS: [number, number][] = [[904, 432], [892, 486], [916, 540], [884, 600], [808, 640], [772, 700], [690, 740], [600, 768], [520, 812], [430, 836], [320, 884], [200, 920], [60, 980]]
function catmull(pts: [number, number][], steps = 14) {
  const out: [number, number][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}
const RIVER_LINE = catmull(RIVER_PTS)
const riverAt = (i: number) => {
  const a = RIVER_LINE[Math.max(0, i - 1)], b = RIVER_LINE[Math.min(RIVER_LINE.length - 1, i + 1)]
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
  return { x: RIVER_LINE[i][0], y: RIVER_LINE[i][1], ang, t: i / (RIVER_LINE.length - 1) }
}
function ribbon(extra: number, wobble: number) {
  const left: string[] = [], right: string[] = []
  RIVER_LINE.forEach((_, i) => {
    const { x, y, ang, t } = riverAt(i)
    const w = 5 + 82 * Math.pow(t, 1.15) + extra * (0.4 + t) + wobble * Math.sin(i * 0.9) * t
    const nx = -Math.sin(ang), ny = Math.cos(ang)
    left.push(`${(x + nx * w).toFixed(1)} ${(y + ny * w).toFixed(1)}`)
    right.unshift(`${(x - nx * w * 0.92).toFixed(1)} ${(y - ny * w * 0.92).toFixed(1)}`)
  })
  return `M${left.join(' L')} L${right.join(' L')} Z`
}
const RIVER_BANK = ribbon(16, 5)
const inRiver = (x: number, y: number) => RIVER_LINE.some(([rx, ry], i) => Math.hypot(rx - x, ry - y) < 5 + 82 * Math.pow(i / (RIVER_LINE.length - 1), 1.15) + 34)
const RIVER_WATER = ribbon(0, 3)
const RIVER_MID = 'M' + RIVER_LINE.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')
const RIPPLES = Array.from({ length: 22 }, (_, k) => riverAt(Math.round(18 + (k / 22) * (RIVER_LINE.length - 26)))).map((r, k) => ({ ...r, off: ((k * 37) % 9) - 4, s: 0.6 + r.t * 1.4 }))
const STONES = [[0.3, 1], [0.45, -1], [0.62, 1], [0.78, -1], [0.9, 1]].map(([t, side]) => {
  const r = riverAt(Math.round(t * (RIVER_LINE.length - 1)))
  const w = 5 + 82 * Math.pow(r.t, 1.15) + 20
  return { x: r.x - Math.sin(r.ang) * w * side, y: r.y + Math.cos(r.ang) * w * side, s: 0.7 + r.t }
})

// The caption card takes the colour of what each beat is about: mountain, river, forest, trail, summit.
const TONES = ['transparent', 'var(--lilac)', 'var(--sky)', 'var(--mint)', 'var(--peach)', 'var(--butter)']

const PALETTE = {
  light: { sky: ['#ffe4d8', '#dfe9ff', '#e9e6ff'], far: '#d9d2fb', mid: '#c7dbfb', mountain: '#cdd5fb', shade: '#b4bdf3', meadow: '#cdeccf', snow: '#ffffff', river: '#8fb3ff', bank: '#b5e3c0', stone: '#c3bdd6', tree: ['#1fa456', '#5cc07f'] },
  dark: { sky: ['#2b1f1c', '#18233d', '#211f3d'], far: '#2c2954', mid: '#213259', mountain: '#2f3566', shade: '#252a55', meadow: '#1e3a28', snow: '#d9dcff', river: '#3f6fe0', bank: '#21452f', stone: '#3d3a52', tree: ['#1fa456', '#3f8f5c'] },
} as const

const clamp = (v: number) => Math.min(1, Math.max(0, v))
// Plain function transforms: Motion would hand an array-mapped opacity to a native ScrollTimeline measured over the wrong range.
const lerp = (a: number, b: number, from: number, to: number) => (v: number) => from + (to - from) * clamp((v - a) / (b - a))

export function Story() {
  const section = useRef<HTMLElement>(null)
  const trail = useRef<SVGPathElement>(null)
  const hiker = useRef<SVGGElement>(null)
  const [beat, setBeat] = useState(0)
  const [walking, setWalking] = useState(false)
  const idle = useRef(0)
  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const [theme] = useTheme()
  const pal = PALETTE[theme]

  const sky = useTransform(p, [0, 0.5, 1], [...pal.sky])
  const sunY = useTransform(p, lerp(0, 0.6, 420, 0))
  const farY = useTransform(p, lerp(0, 0.14, 320, 0))
  const midY = useTransform(p, lerp(0.04, 0.2, 360, 0))
  const mountainY = useTransform(p, lerp(0.1, 0.3, 700, 0))
  const snow = useTransform(p, lerp(0.26, 0.33, 0, 1))
  const meadowY = useTransform(p, lerp(0.08, 0.24, 300, 0))
  const river = useTransform(p, lerp(0.33, 0.52, 0, 1))
  const spring = useTransform(p, lerp(0.32, 0.36, 0, 1))
  const riverOn = useTransform(p, lerp(0.325, 0.335, 0, 1))
  const trailOn = useTransform(p, lerp(0.66, 0.7, 0, 1))
  const trailInk = useTransform(p, lerp(0.7, 0.705, 0, 1))
  const trailDraw = useTransform(p, lerp(0.7, 0.88, 0, 1))
  const walk = useTransform(p, lerp(0.72, 0.9, 0, 1))
  const flag = useTransform(p, lerp(0.88, 0.94, 0, 1))
  const sign = useTransform(p, lerp(0.66, 0.72, 0, 1))
  const zoom = 1
  const cloudsA = useTransform(p, lerp(0, 1, 0, -320))
  const cloudsB = useTransform(p, lerp(0, 1, 0, -160))
  const birds = useTransform(p, lerp(0.1, 0.62, -200, 1800))
  const alt = useTransform(p, (v) => `${String(Math.round(420 + v * 1860)).padStart(4, '0')} m`)

  useMotionValueEvent(p, 'change', (v) => {
    let b = 0
    BEATS.forEach((x, i) => { if (v >= x.at) b = i })
    setBeat((cur) => (cur === b ? cur : b))
    setWalking(true)
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setWalking(false), 180)
  })
  useMotionValueEvent(walk, 'change', (v) => {
    const path = trail.current
    if (!path || !hiker.current) return
    const pt = path.getPointAtLength(path.getTotalLength() * v)
    hiker.current.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`)
  })

  return (
    <section ref={section} className="fg-story" aria-label="The trail, built piece by piece">
      <motion.div className="fg-story__stage" style={{ background: sky }}>
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className="fg-story__svg" aria-hidden>
          <motion.g style={{ scale: zoom, transformOrigin: '1180px 820px' }}>
            <motion.circle cx={1120} cy={250} r={64} fill="var(--yellow)" style={{ y: sunY }} />
            <motion.g style={{ x: cloudsB }}>
              <Cloud x={160} y={140} s={1} />
              <Cloud x={1300} y={110} s={0.8} />
              <Cloud x={1900} y={200} s={1.1} />
            </motion.g>
            <motion.path d={FAR} fill={pal.far} style={{ y: farY }} />
            <motion.path d={MID} fill={pal.mid} style={{ y: midY }} />

            <motion.g style={{ y: mountainY }}>
              <path d={MOUNTAIN} fill={pal.mountain} />
              <path d={SHADE} fill={pal.shade} />
              <motion.path d={SNOW} fill={pal.snow} style={{ scale: snow, transformOrigin: '880px 200px' }} />
            </motion.g>

            <motion.g style={{ y: meadowY }}>
              <path d={MEADOW} fill={pal.meadow} />
            </motion.g>

            {/* the river: revealed from the spring downhill, then ripples drift down it */}
            <mask id="fg-river-reveal" maskUnits="userSpaceOnUse" x={0} y={0} width={1600} height={1000}>
              <motion.path d={RIVER_MID} fill="none" stroke="#fff" strokeWidth={260} strokeLinecap="butt" style={{ pathLength: river, opacity: riverOn }} />
            </mask>
            <g mask="url(#fg-river-reveal)">
              <path d={RIVER_BANK} fill={pal.bank} />
              <path d={RIVER_WATER} fill={pal.river} />
              <path d={RIVER_WATER} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={3} strokeDasharray="60 30 14 30" />
              <motion.ellipse cx={904} cy={436} rx={22} ry={9} fill={pal.river} style={{ scale: spring }} />
              {RIPPLES.map((r, k) => (
                <g key={k} transform={`translate(${r.x.toFixed(1)} ${r.y.toFixed(1)}) rotate(${(r.ang * 180 / Math.PI).toFixed(1)}) translate(0 ${r.off * r.s})`}>
                  <g className="fg-ripple" style={{ animationDelay: `${-(k * 0.37) % 2.4}s` }}>
                    <path d={`M${-9 * r.s} 0 q${4.5 * r.s} ${-4 * r.s} ${9 * r.s} 0 t${9 * r.s} 0`} fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
                  </g>
                </g>
              ))}
            </g>
            <motion.g style={{ opacity: useTransform(p, lerp(0.45, 0.5, 0, 1)) }}>
              {STONES.map((st, k) => (
                <g key={k} transform={`translate(${st.x.toFixed(1)} ${st.y.toFixed(1)}) scale(${st.s.toFixed(2)})`}>
                  <ellipse rx={13} ry={8} fill={pal.stone} /><ellipse cx={-3} cy={-3} rx={5} ry={2.5} fill="#fff" opacity={0.35} />
                </g>
              ))}
            </motion.g>

            {TREES.filter(([x, y]) => !inRiver(x, y)).map(([x, y, s], i) => <Grow key={i} x={x} y={y} s={s} p={p} at={0.5 + (x / 1600) * 0.16} colors={pal.tree} />)}

            {/* the trail, drawn from the trailhead to the summit */}
            <motion.path d={TRAIL} style={{ opacity: trailOn }} fill="none" stroke="var(--ink)" strokeOpacity={0.18} strokeWidth={5} strokeDasharray="2 14" strokeLinecap="round" />
            <motion.path ref={trail} d={TRAIL} fill="none" stroke="var(--orange)" strokeWidth={7} strokeLinecap="round" style={{ pathLength: trailDraw, opacity: trailInk }} />
            {SIGNALS.map(([at], i) => <Checkpoint key={i} at={at} p={p} path={trail} />)}

            <g transform="translate(1230 872)">
              <motion.g style={{ scale: sign, transformOrigin: '0px 0px' }}>
                <rect x={-4} y={-110} width={8} height={110} rx={3} fill="var(--solid)" />
                <path d="M-70 -116 H60 L84 -94 L60 -72 H-70 Z" fill="var(--orange)" stroke="var(--solid)" strokeWidth={4} strokeLinejoin="round" />
                <text x={-4} y={-87} textAnchor="middle" className="fg-story__sign">TRAILHEAD</text>
              </motion.g>
            </g>
            <g transform="translate(880 208)">
              <motion.g style={{ scaleY: flag, transformOrigin: '0px 0px' }}>
                <rect x={-3} y={-96} width={6} height={96} rx={2} fill="var(--solid)" />
                <motion.path d="M3 -94 L60 -80 L3 -62 Z" fill="var(--orange)" animate={{ d: ['M3 -94 L60 -80 L3 -62 Z', 'M3 -94 L56 -74 L3 -62 Z', 'M3 -94 L60 -80 L3 -62 Z'] }} transition={{ duration: 1.4, repeat: Infinity }} />
              </motion.g>
            </g>

            <motion.g style={{ opacity: useTransform(p, lerp(0.7, 0.72, 0, 1)) }}>
              <g ref={hiker} transform="translate(1230 872)">
                <motion.g animate={walking ? { y: [0, -10, 0] } : { y: 0 }} transition={walking ? { duration: 0.4, repeat: Infinity } : { duration: 0.2 }}>
                  <g transform="translate(-30 -62)"><Shape kind="tag" color="var(--orange)" glyph="flag" size={56} /></g>
                </motion.g>
              </g>
            </motion.g>

            <motion.g style={{ x: cloudsA }}>
              <Cloud x={700} y={300} s={0.65} />
              <Cloud x={1700} y={330} s={0.8} />
            </motion.g>
            <motion.g style={{ x: birds }}>
              {[[0, 160], [34, 146], [64, 166]].map(([x, y], i) => (
                <motion.path key={i} d={`M${x} ${y} q9 -9 16 0 q7 -9 16 0`} fill="none" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" animate={{ scaleY: [1, 0.4, 1] }} transition={{ duration: 0.7 + i * 0.1, repeat: Infinity }} />
              ))}
            </motion.g>
          </motion.g>
        </svg>

        <div className={`fg-story__caption ${beat === 0 ? 'is-title' : ''}`}>
          <TrailCaption k={beat} big={beat === 0} tone={TONES[beat]} title={BEATS[beat].title} body={BEATS[beat].body}
            kicker={beat === 0 ? BEATS[0].n : <><Odometer value={BEATS[beat].n.slice(0, 2)} />{BEATS[beat].n.slice(2)}</>} />
        </div>
        <div className="fg-story__alt" aria-hidden>
          <span>altitude</span>
          <motion.b>{alt}</motion.b>
          <div className="fg-story__meter"><motion.i style={{ scaleY: p, originY: 1 }} /></div>
        </div>
        <motion.div className="fg-story__hint" style={{ opacity: useTransform(p, lerp(0, 0.05, 1, 0)) }} aria-hidden>scroll to build the trail ↓</motion.div>
      </motion.div>
    </section>
  )
}

/** A tree that grows up out of the ground when the scroll reaches it. */
function Grow({ x, y, s, p, at, colors }: { x: number; y: number; s: number; p: MotionValue<number>; at: number; colors: readonly string[] }) {
  const grow = useTransform(p, (v) => {
    const t = clamp((v - at) / 0.06)
    return 1 - Math.pow(1 - t, 3) * (1 - t * 0.0)
  })
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g style={{ scale: grow, transformOrigin: '0px 0px' }}>
        <g className="fg-sway" style={{ animationDelay: `${(x % 7) * -0.5}s` }}>
          <g transform={`scale(${s})`}>
            <ellipse cy={2} rx={20} ry={5} fill="var(--solid)" opacity={0.12} />
            <rect x={-3} y={-8} width={6} height={10} fill="var(--solid)" />
            <path d="M0 -50 L18 -8 L-18 -8 Z" fill={colors[0]} />
            <path d="M0 -64 L13 -32 L-13 -32 Z" fill={colors[1]} />
          </g>
        </g>
      </motion.g>
    </g>
  )
}

/** A three-lamp signal that stands up beside the trail once the drawn trail reaches it, then turns green. */
function Checkpoint({ at, p, path }: { at: number; p: MotionValue<number>; path: React.RefObject<SVGPathElement | null> }) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null)
  const start = 0.7 + at * 0.18
  const up = useTransform(p, lerp(start, start + 0.025, 0, 1))
  const [green, setGreen] = useState(false)
  useMotionValueEvent(p, 'change', (v) => {
    if (!pt && path.current) {
      const q = path.current.getPointAtLength(path.current.getTotalLength() * at)
      setPt({ x: q.x, y: q.y })
    }
    setGreen(v > start + 0.04)
  })
  if (!pt) return null
  return (
    <g transform={`translate(${pt.x + 34} ${pt.y})`}>
      <motion.g style={{ scaleY: up, transformOrigin: '0px 0px' }}>
        <rect x={-3} y={-40} width={6} height={40} fill="var(--solid)" />
        <rect x={-13} y={-92} width={26} height={56} rx={8} fill="var(--solid)" />
        <circle cy={-80} r={7} fill={green ? '#3d3b45' : 'var(--stop)'} />
        <circle cy={-64} r={7} fill="#3d3b45" />
        <circle cy={-48} r={7} fill={green ? 'var(--go)' : '#3d3b45'} />
      </motion.g>
    </g>
  )
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="var(--surface)" opacity={0.94}>
      <rect x={0} y={20} width={220} height={44} rx={22} />
      <rect x={40} y={0} width={90} height={60} rx={30} />
      <rect x={100} y={-14} width={80} height={70} rx={35} />
    </g>
  )
}
