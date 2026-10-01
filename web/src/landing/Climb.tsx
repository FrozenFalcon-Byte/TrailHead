import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Hiker } from '../motion/Hiker'

/* A scroll-driven scene: the hiker climbs from the README trailhead to the file that answers the question.
   The scene is drawn in a 1600×900 world. A camera follows the hiker, zoomed in at the start and pulling back
   to reveal the whole mountain at the summit; the background layers move at a fraction of the camera for depth. */

const W = 1600
const H = 900
const EASE = [0.22, 1, 0.36, 1] as const

const TRAIL = 'M150 842 C 360 838, 600 812, 740 752 S 600 650, 520 616 S 640 548, 860 520 S 1010 452, 930 404 S 860 330, 1000 290 S 1150 236, 1182 196'
const FRONT = 'M-900 1900 L-900 690 C -300 680, 120 650, 360 590 C 620 520, 820 380, 1000 270 C 1080 220, 1140 170, 1186 160 C 1260 180, 1380 260, 1520 330 C 1800 450, 2200 520, 2600 560 L2600 1900 Z'
const MID = 'M-900 1900 L-900 640 C -500 600, -200 520, 80 470 C 260 440, 380 360, 520 330 C 640 360, 700 420, 820 440 C 1100 380, 1300 300, 1460 260 C 1620 300, 1900 400, 2600 430 L2600 1900 Z'
const FAR = 'M-900 1900 L-900 520 C -600 460, -300 400, -40 330 L180 230 L330 330 C 420 290, 520 250, 640 180 L760 260 C 900 230, 1040 200, 1200 120 L1360 220 C 1500 200, 1700 230, 2000 260 L2600 300 L2600 1900 Z'
const SNOW = 'M1132 186 L1186 160 L1240 178 L1214 196 L1196 186 L1176 204 L1160 192 Z'

const TREES: [number, number, number][] = [
  [260, 760, 1], [300, 772, 0.8], [440, 700, 1.1], [470, 716, 0.85], [820, 640, 1], [860, 660, 0.9], [380, 840, 1.2],
  [1100, 520, 1], [1140, 540, 0.8], [1320, 420, 1], [1360, 440, 1.15], [700, 560, 0.9], [1240, 660, 1.2], [1420, 600, 1],
  [90, 760, 1], [600, 700, 0.9], [980, 600, 1.1], [1500, 520, 0.9], [60, 860, 1.3], [1000, 820, 1.2],
]

const STOPS = [
  { at: 0.02, kicker: 'trailhead', title: 'README.md', note: 'every tour starts somewhere plain', side: 'right' },
  { at: 0.34, kicker: 'step 1 · folder', title: 'scrapy/', note: 'relevant 0.97', side: 'left' },
  { at: 0.67, kicker: 'step 2 · folder', title: 'downloadermiddlewares/', note: 'relevant 0.99', side: 'right' },
  { at: 0.985, kicker: 'summit · the answer', title: 'retry.py', note: 'cited · P(supports) 0.91', side: 'left' },
] as const

const PHASES = [
  { n: '01', title: 'Start at the trailhead', body: 'You ask a question. Trailhead begins where you would: the README and the top of the tree.' },
  { n: '02', title: 'Pick a direction', body: 'Jev weighs every folder and returns a calibrated probability. Code keeps the best few and drops the rest.' },
  { n: '03', title: 'Narrow it down', body: 'Each step down the tree is one cheap decision. The beam keeps alternatives in case the first path dead-ends.' },
  { n: '04', title: 'Reach the summit', body: 'The file that answers it, every claim cited to evidence, and a clear note of what is still uncertain.' },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function Climb() {
  const section = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const trail = useRef<SVGPathElement>(null)
  const hiker = useRef<SVGGElement>(null)
  const size = useRef({ w: 0, h: 0 })
  const last = useRef({ v: 0, facing: 1 })
  const idle = useRef(0)
  const [walking, setWalking] = useState(false)
  const [facing, setFacing] = useState(1)
  const [phase, setPhase] = useState(0)
  const [world, setWorld] = useState({ k: 1, x: 0, y: 0 })
  const [pins, setPins] = useState<{ x: number; y: number }[]>([])

  const { scrollYProgress: p } = useScroll({ target: section, offset: ['start start', 'end end'] })
  const camX = useMotionValue(0)
  const camY = useMotionValue(0)
  const zoom = useMotionValue(1.6)
  const origin = useMotionValue('0px 0px')

  const place = useCallback((v: number) => {
    const path = trail.current
    const { w, h } = size.current
    if (!path || !w) return
    const len = path.getTotalLength()
    const at = path.getPointAtLength(len * v)
    const next = path.getPointAtLength(Math.min(len, len * v + 3))
    const prev = path.getPointAtLength(Math.max(0, len * v - 3))
    hiker.current?.setAttribute('transform', `translate(${at.x} ${at.y})`)

    const moving = v - last.current.v
    if (Math.abs(moving) > 1e-5) {
      const dir = Math.sign(next.x - prev.x || 1) * Math.sign(moving)
      if (dir !== last.current.facing) {
        last.current.facing = dir
        setFacing(dir)
      }
    }
    last.current.v = v

    const k = Math.max(w / W, h / H)
    const offX = (w - W * k) / 2
    const offY = (h - H * k) / 2
    const narrow = w < 820
    const z = narrow ? lerp(1.35, 1.1, smooth(0, 1, v)) : lerp(1.75, 1, smooth(0.05, 1, v))
    const follow = narrow ? 1 : 1 - smooth(0.6, 1, v)
    const tx = w * (narrow ? 0.5 : 0.42)
    const ty = h * 0.64
    camX.set(follow * (tx - offX - at.x * k))
    camY.set(follow * (ty - offY - at.y * k))
    zoom.set(z)
    origin.set(`${at.x * k}px ${at.y * k}px`)
  }, [camX, camY, zoom, origin])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      size.current = { w, h }
      const k = Math.max(w / W, h / H)
      setWorld({ k, x: (w - W * k) / 2, y: (h - H * k) / 2 })
      const path = trail.current
      if (path) {
        const len = path.getTotalLength()
        setPins(STOPS.map((s) => {
          const pt = path.getPointAtLength(len * s.at)
          return { x: pt.x, y: pt.y }
        }))
      }
      place(p.get())
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [place, p])

  useMotionValueEvent(p, 'change', (v) => {
    place(v)
    const next = v < 0.2 ? 0 : v < 0.5 ? 1 : v < 0.86 ? 2 : 3
    setPhase((cur) => (cur === next ? cur : next))
    setWalking(true)
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setWalking(false), 180)
  })
  useEffect(() => () => window.clearTimeout(idle.current), [])

  const sky = useTransform(p, [0, 0.45, 1], ['#ffe4cf', '#dcf0fb', '#efe3fb'])
  const sunY = useTransform(p, [0, 1], ['78%', '14%'])
  const sunScale = useTransform(p, [0, 1], [1.25, 0.85])
  const cloudDrift = useTransform(p, [0, 1], [0, -260])
  const cloudDriftSlow = useTransform(p, [0, 1], [0, -120])
  const birds = useTransform(p, [0.15, 0.75], ['-10%', '110%'])
  const alt = useTransform(p, (v) => `${String(Math.round(420 + v * 1860)).padStart(4, '0')} m`)
  const meter = useTransform(p, [0, 1], [0, 1])
  const flag = useTransform(p, [0.9, 0.97], [0, 1])

  const layer = (f: number) => ({
    x: useTransform(camX, (v) => v * f),
    y: useTransform(camY, (v) => v * f),
    scale: useTransform(zoom, (v) => 1 + (v - 1) * f),
    transformOrigin: origin,
  })
  const far = layer(0.3)
  const mid = layer(0.6)
  const worldBox = { position: 'absolute' as const, left: world.x, top: world.y, width: W * world.k, height: H * world.k }

  return (
    <section ref={section} className="l-climb" id="climb" aria-label="How a question becomes an answer">
      <motion.div ref={stage} className="l-climb__stage" style={{ background: sky }}>
        <motion.div className="l-climb__sun" style={{ top: sunY, scale: sunScale }} />
        <motion.svg className="l-climb__clouds" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style={{ x: cloudDriftSlow }} aria-hidden>
          <Cloud x={180} y={160} s={1.1} />
          <Cloud x={1250} y={110} s={0.8} />
          <Cloud x={1800} y={210} s={1} />
        </motion.svg>

        <motion.div style={{ ...worldBox, ...far }} aria-hidden>
          <svg viewBox="0 0 1600 900" width="100%" height="100%" style={{ overflow: 'visible' }}>
            <path d={FAR} fill="#e4d4f1" />
            <path d="M180 230 L222 262 L200 258 L180 270 L160 256 L140 262 Z M640 180 L690 214 L660 210 L640 224 L620 210 L596 212 Z" fill="#fff" opacity={0.85} />
          </svg>
        </motion.div>
        <motion.div style={{ ...worldBox, ...mid }} aria-hidden>
          <svg viewBox="0 0 1600 900" width="100%" height="100%" style={{ overflow: 'visible' }}>
            <path d={MID} fill="#cbe3f1" />
          </svg>
        </motion.div>

        <motion.svg className="l-climb__clouds" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" style={{ x: cloudDrift }} aria-hidden>
          <Cloud x={620} y={300} s={0.7} />
          <Cloud x={1500} y={360} s={0.9} />
        </motion.svg>
        <motion.div className="l-climb__birds" style={{ left: birds }} aria-hidden>
          <svg width="90" height="40" viewBox="0 0 90 40">
            {[[0, 18], [30, 6], [56, 22]].map(([x, y], i) => (
              <motion.path key={i} d={`M${x} ${y} q8 -8 14 0 q6 -8 14 0`} fill="none" stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" animate={{ scaleY: [1, 0.4, 1] }} transition={{ duration: 0.7 + i * 0.1, repeat: Infinity }} />
            ))}
          </svg>
        </motion.div>

        {/* The world the camera follows */}
        <motion.div style={{ ...worldBox, x: camX, y: camY, scale: zoom, transformOrigin: origin }}>
          <svg viewBox="0 0 1600 900" width="100%" height="100%" style={{ overflow: 'visible' }} aria-hidden>
            <path d={FRONT} fill="#d3eac8" />
            <path d="M1186 160 C 1260 180, 1380 260, 1520 330 C 1800 450, 2200 520, 2600 560 L2600 1900 L1300 1900 C 1260 1200, 1240 600, 1186 160 Z" fill="#c2e0b5" />
            <path d={SNOW} fill="#fff" />
            <path d="M-900 1900 L-900 860 C -200 830, 400 880, 900 900 C 1400 920, 2000 870, 2600 880 L2600 1900 Z" fill="#b5d9a6" />
            {TREES.map(([x, y, s], i) => <Tree key={i} x={x} y={y} s={s} />)}
            <path d={TRAIL} fill="none" stroke="var(--lichen)" strokeOpacity={0.35} strokeWidth={4} strokeDasharray="2 14" strokeLinecap="round" />
            <motion.path ref={trail} d={TRAIL} fill="none" stroke="var(--blaze)" strokeWidth={7} strokeLinecap="round" style={{ pathLength: p }} />
            {pins.map((pin, i) => <Post key={i} x={pin.x} y={pin.y} at={STOPS[i].at} p={p} />)}
            <g transform="translate(1182 196)"><motion.g style={{ scaleY: flag, originY: 1 }}>
              <rect x={-3} y={-96} width={6} height={96} rx={2} fill="var(--ink)" />
              <motion.path d="M3 -94 L60 -80 L3 -62 Z" fill="var(--blaze)" animate={{ d: ['M3 -94 L60 -80 L3 -62 Z', 'M3 -94 L56 -74 L3 -62 Z', 'M3 -94 L60 -80 L3 -62 Z'] }} transition={{ duration: 1.4, repeat: Infinity }} />
            </motion.g></g>
            <g ref={hiker} transform="translate(150 842)">
              <g transform={`scale(${facing} 1)`}>
                <g transform="translate(-34 -88)">
                  <Hiker size={70} color="var(--ink)" walking={walking} speed={0.55} />
                </g>
              </g>
            </g>
          </svg>
          {pins.map((pin, i) => <StopCard key={i} stop={STOPS[i]} x={pin.x * world.k} y={pin.y * world.k} k={world.k} p={p} />)}
        </motion.div>

        {/* Caption + altimeter stay fixed on screen */}
        <div className="l-climb__caption">
          <AnimatePresence mode="wait">
            <motion.div key={phase} initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } }} exit={{ opacity: 0, y: -20, transition: { duration: 0.25 } }}>
              <div className="kicker" style={{ color: 'var(--blaze)' }}>{PHASES[phase].n} / 04</div>
              <h3 className="display l-climb__title">{PHASES[phase].title}</h3>
              <p className="body l-climb__body">{PHASES[phase].body}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="l-climb__alt" aria-hidden>
          <div className="small">altitude</div>
          <motion.div className="display" style={{ fontSize: 30 }}>{alt}</motion.div>
          <div className="l-climb__meter"><motion.div style={{ scaleY: meter, originY: 1 }} /></div>
        </div>
        <div className="l-climb__hint small" aria-hidden>keep scrolling ↓</div>
      </motion.div>
    </section>
  )
}

function Cloud({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={0.92}>
      <rect x={0} y={20} width={220} height={44} rx={22} />
      <rect x={40} y={0} width={90} height={60} rx={30} />
      <rect x={100} y={-14} width={80} height={70} rx={35} />
    </g>
  )
}

function Tree({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-3} y={-6} width={6} height={12} fill="#7a5a3a" />
      <path d="M0 -46 L16 -6 L-16 -6 Z" fill="#5f9c6c" />
      <path d="M0 -58 L12 -28 L-12 -28 Z" fill="#7bb685" />
    </g>
  )
}

function Post({ x, y, at, p }: { x: number; y: number; at: number; p: MotionValue<number> }) {
  const lo = Math.max(0, at - 0.03)
  const s = useTransform(p, (v) => Math.min(1, Math.max(0, (v - lo) / (Math.max(0.001, at) - lo))))
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g style={{ scale: s, originY: 1 }}>
        <rect x={-5} y={-44} width={10} height={44} rx={2} fill="var(--ink)" />
        <rect x={-11} y={-56} width={22} height={18} rx={3} fill="var(--blaze)" />
      </motion.g>
    </g>
  )
}

function StopCard({ stop, x, y, k, p }: { stop: (typeof STOPS)[number]; x: number; y: number; k: number; p: MotionValue<number> }) {
  const a = Math.max(0, stop.at - 0.035)
  const b = Math.max(0.001, stop.at - 0.005)
  // A function transform (rather than a range map) keeps this off the browser's scroll timeline, which mis-times it.
  const shown = useTransform(p, (v) => Math.min(1, Math.max(0, (v - a) / (b - a))))
  const lift = useTransform(shown, [0, 1], [24, 0])
  const rotate = useTransform(shown, [0, 1], [stop.side === 'left' ? 8 : -8, stop.side === 'left' ? -2 : 2])
  return (
    <motion.div
      className="l-climb__card"
      style={{ left: x + (stop.side === 'left' ? -18 : 18) * k, top: y - 118 * k, opacity: shown, scale: shown, y: lift, rotate, translateX: stop.side === 'left' ? '-100%' : '0%', translateY: '-100%' }}
    >
      <div className="small" style={{ opacity: 0.6 }}>{stop.kicker}</div>
      <div className="l-climb__card-title mono">{stop.title}</div>
      <span className="pill" style={{ ['--fg' as string]: 'var(--lichen)' }}>{stop.note}</span>
    </motion.div>
  )
}
