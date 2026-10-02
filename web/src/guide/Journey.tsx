import { AnimatePresence, motion, useMotionValue, useMotionValueEvent, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../lib/theme'
import { Shape } from '../motion/Shapes'
import { CHAPTERS, type Place } from './chapters'

/* The journey strip: a long side-on landscape pinned above the chapters. Reading the guide walks the flag along it,
   from the trailhead, over the river and through the forest, up to the summit. Each chapter has its own landmark,
   and the one for the chapter you're reading wakes up (the gate lifts, the signal turns green, the fire flickers).
   `pos` is the reading position as a chapter index with a fraction, so the walk follows the scroll exactly. */

const H = 200
const GAP = 340
const X0 = 240
const WORLD = X0 + GAP * (CHAPTERS.length - 1) + 420
const stopX = (i: number) => X0 + i * GAP
const ground = (x: number) => 168 - 44 * Math.min(1, Math.max(0, x / WORLD)) + 5 * Math.sin(x / 150) + 3 * Math.sin(x / 61)
const HIKER = 0.34 // where the hiker stands across the strip
const EYE = 150 // the ground under the hiker sits at this height on screen

const PALETTE = {
  light: { sky: ['#ffe4d8', '#dfe9ff', '#e9e6ff'], sun: '#ffbd1a', far: '#d9d2fb', mid: '#c7dbfb', ground: '#cdeccf', edge: '#acd9b4', grass: '#9fd2a9', tree: ['#1fa456', '#5cc07f'], river: '#7fa6ff', rock: '#c9c3d9', wood: '#c58c5c', snow: '#ffffff' },
  dark: { sky: ['#2b1f1c', '#18233d', '#211f3d'], sun: '#d9dcff', far: '#2c2954', mid: '#213259', ground: '#1e3a28', edge: '#152c1d', grass: '#24472f', tree: ['#1fa456', '#3f8f5c'], river: '#3f74f6', rock: '#3d3a52', wood: '#7a5638', snow: '#d9dcff' },
} as const
type Pal = (typeof PALETTE)['light'] | (typeof PALETTE)['dark']

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) / 2147483647)
}

function line(from: number, to: number, step: number, y: (x: number) => number, bottom = 260) {
  let d = `M${from} ${bottom}`
  for (let x = from; x <= to; x += step) d += ` L${x} ${y(x).toFixed(1)}`
  return `${d} L${to} ${bottom} Z`
}

export function Journey({ pos, active }: { pos: MotionValue<number>; active: number }) {
  const box = useRef<HTMLDivElement>(null)
  const vw = useMotionValue(900)
  const [theme] = useTheme()
  const pal = PALETTE[theme]
  const [moving, setMoving] = useState(false)
  const [back, setBack] = useState(false)
  const idle = useRef(0)
  const last = useRef(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => vw.set((H * el.clientWidth) / Math.max(1, el.clientHeight)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [vw])

  const camX = useTransform(pos, (p) => {
    const i = Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor(p)))
    const f = Math.min(1, Math.max(0, p - i))
    return stopX(i) + f * (i < CHAPTERS.length - 1 ? GAP : 0)
  })
  const lift = useTransform(camX, (c) => EYE - ground(c))
  const layer = (k: number) => ({
    x: useTransform([camX, vw], ([c, w]: number[]) => w * HIKER - c * k),
    y: useTransform(lift, (l) => l * k),
  })
  const far = layer(0.22)
  const mid = layer(0.5)
  const near = layer(1)
  const front = { x: useTransform([camX, vw], ([c, w]: number[]) => w * HIKER - c * 1.3) }
  const sky = useTransform(pos, [0, (CHAPTERS.length - 1) / 2, CHAPTERS.length - 1], [...pal.sky])
  const sunX = useTransform([pos, vw], ([p, w]: number[]) => w * (0.18 + 0.64 * (p / (CHAPTERS.length - 1))))
  const sunY = useTransform(pos, (p) => 120 - 86 * Math.sin(Math.PI * (0.1 + 0.8 * (p / (CHAPTERS.length - 1)))))
  const walked = useTransform(camX, (c) => Math.max(0, c + 600))

  useMotionValueEvent(pos, 'change', (p) => {
    if (Math.abs(p - last.current) < 0.0005) return
    setBack(p < last.current)
    last.current = p
    setMoving(true)
    window.clearTimeout(idle.current)
    idle.current = window.setTimeout(() => setMoving(false), 200)
  })

  const geo = useMemo(() => {
    const r = rng(7)
    const farD = line(-600, WORLD * 0.22 + 2600, 60, (x) => 96 + 26 * Math.sin(x / 90) + 14 * Math.sin(x / 37 + 1))
    const midD = line(-600, WORLD * 0.5 + 2600, 40, (x) => 128 + 16 * Math.sin(x / 120 + 2) + 8 * Math.sin(x / 47))
    const groundD = line(-800, WORLD + 1600, 24, ground)
    const trailD = (() => {
      let d = ''
      for (let x = -600; x <= WORLD + 400; x += 16) d += `${d ? ' L' : 'M'}${x} ${(ground(x) + 9).toFixed(1)}`
      return d
    })()
    const busy = CHAPTERS.map((_, i) => stopX(i))
    const trees: [number, number, number][] = []
    for (let x = -500; x < WORLD + 1400; x += 38 + r() * 60) {
      if (busy.some((b) => Math.abs(b - x) < 80)) continue
      trees.push([x, ground(x) - 4 - r() * 4, 0.55 + r() * 0.5])
    }
    const tufts: [number, number][] = []
    for (let x = -800; x < (WORLD + 1600) * 1.3; x += 70 + r() * 120) tufts.push([x, r()])
    return { farD, midD, groundD, trailD, trees, tufts }
  }, [])

  return (
    <div ref={box} className="fg-journey" aria-hidden>
      <motion.svg className="fg-journey__svg" style={{ background: sky }} preserveAspectRatio="xMinYMid slice" viewBox={useTransform(vw, (w) => `0 0 ${w.toFixed(1)} ${H}`)}>
        <motion.circle r={20} fill={pal.sun} style={{ x: sunX, y: sunY }} />
        <g className="fg-journey__clouds">
          {[[0.1, 34, 0.7], [0.48, 22, 0.55], [0.8, 46, 0.8]].map(([x, y, s], i) => (
            <motion.g key={i} style={{ x: useTransform(vw, (w) => w * x) }}>
              <g className="fg-drift" style={{ animationDuration: `${40 + i * 14}s`, animationDelay: `${-i * 9}s` }}>
                <g transform={`translate(0 ${y}) scale(${s})`} fill="var(--surface)" opacity={0.92}>
                  <rect y={12} width={110} height={24} rx={12} />
                  <rect x={22} width={46} height={32} rx={16} />
                  <rect x={52} y={-6} width={36} height={34} rx={17} />
                </g>
              </g>
            </motion.g>
          ))}
        </g>
        <motion.path d={geo.farD} fill={pal.far} style={far} />
        <motion.path d={geo.midD} fill={pal.mid} style={mid} />

        <motion.g style={near}>
          {geo.trees.map(([x, y, s], i) => <Tree key={i} x={x} y={y} s={s} pal={pal} />)}
          <path d={geo.groundD} fill={pal.ground} />
          <path d={geo.groundD} fill="none" stroke={pal.edge} strokeWidth={3} />
          <path d={geo.trailD} fill="none" stroke="var(--ink)" strokeOpacity={0.2} strokeWidth={3} strokeDasharray="1 9" strokeLinecap="round" />
          <clipPath id="fg-walked"><motion.rect x={-600} y={0} height={400} style={{ width: walked }} /></clipPath>
          <path d={geo.trailD} fill="none" stroke="var(--orange)" strokeWidth={4} strokeLinecap="round" clipPath="url(#fg-walked)" />
          {CHAPTERS.map((c, i) => (
            <Landmark key={c.id} place={c.place} x={stopX(i)} on={i === active} done={i < active} pal={pal} />
          ))}
        </motion.g>

        <motion.g style={{ x: useTransform(vw, (w) => w * HIKER) }}>
          <g transform={`translate(0 ${EYE + 8})`}>
            <motion.g animate={moving ? { y: [0, -7, 0], rotate: back ? [3, -3, 3] : [-3, 3, -3] } : { y: 0, rotate: 0 }} transition={moving ? { duration: 0.38, repeat: Infinity } : { type: 'spring', stiffness: 300, damping: 14 }}>
              <ellipse cy={0} rx={13} ry={3} fill="var(--solid)" opacity={0.18} />
              <g transform={`translate(${back ? 17 : -17} -34) scale(${back ? -1 : 1} 1)`}>
                <Shape kind="tag" color="var(--orange)" glyph="flag" size={30} play={moving} />
              </g>
            </motion.g>
          </g>
        </motion.g>

        <motion.g style={front}>
          {geo.tufts.map(([x, k], i) => (
            <g key={i} transform={`translate(${x} ${H + 4})`} fill={pal.grass}>
              {k > 0.6 ? <ellipse rx={26 + k * 10} ry={14} fill={pal.rock} /> : <path d="M-14 0 Q-10 -18 -6 0 Q0 -26 4 0 Q8 -16 14 0 Z" />}
            </g>
          ))}
        </motion.g>

        <g className="fg-journey__birds">
          {[0, 18, 34].map((dx, i) => (
            <motion.path key={i} d={`M${dx} ${30 + (i % 2) * 8} q6 -6 11 0 q5 -6 11 0`} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" animate={{ scaleY: [1, 0.4, 1] }} transition={{ duration: 0.6 + i * 0.1, repeat: Infinity }} />
          ))}
        </g>
      </motion.svg>

      <div className="fg-journey__tag">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} initial={{ rotateX: -85 }} animate={{ rotateX: 0, transition: { type: 'spring', stiffness: 180, damping: 17 } }} exit={{ rotateX: 85, transition: { duration: 0.14 } }} style={{ transformOrigin: 'top center' }}>
            <small>Stop {String(active).padStart(2, '0')}</small>
            <b>{CHAPTERS[active].where}</b>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Tree({ x, y, s, pal }: { x: number; y: number; s: number; pal: Pal }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="fg-sway" style={{ animationDelay: `${(x % 11) * -0.4}s` }}>
        <rect x={-2.5} y={-8} width={5} height={10} fill="var(--solid)" />
        <path d="M0 -46 L16 -8 L-16 -8 Z" fill={pal.tree[0]} />
        <path d="M0 -58 L11 -30 L-11 -30 Z" fill={pal.tree[1]} />
      </g>
    </g>
  )
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 14 }

/** One chapter's landmark, standing on the ground at x. `on` is the chapter being read. */
function Landmark({ place, x, on, done, pal }: { place: Place; x: number; on: boolean; done: boolean; pal: Pal }) {
  const y = ground(x)
  const post = (h: number) => <rect x={-2.5} y={-h} width={5} height={h + 4} rx={2} fill="var(--solid)" />
  let art: React.ReactNode = null
  switch (place) {
    case 'trailhead':
      art = (<g>{post(54)}<path d="M-30 -60 H22 L34 -50 L22 -40 H-30 Z" fill="var(--orange)" stroke="var(--solid)" strokeWidth={2.5} strokeLinejoin="round" /><text x={-2} y={-46} textAnchor="middle" className="fg-j-sign">START</text></g>)
      break
    case 'fork':
      art = (<g>{post(56)}
        <motion.path d="M2 -56 H34 L42 -50 L34 -44 H2 Z" fill="var(--violet)" animate={{ rotate: on ? -10 : 0 }} transition={spring} style={{ originX: '2px', originY: '-50px' }} />
        <motion.path d="M-2 -38 H-34 L-42 -32 L-34 -26 H-2 Z" fill="var(--green)" animate={{ rotate: on ? 10 : 0 }} transition={spring} style={{ originX: '-2px', originY: '-32px' }} />
      </g>)
      break
    case 'signal':
      art = (<g>{post(36)}<rect x={-11} y={-84} width={22} height={50} rx={7} fill="var(--solid)" />
        <circle cy={-73} r={6} fill={on ? '#3d3b45' : 'var(--stop)'} /><circle cy={-59} r={6} fill={on ? 'var(--yellow)' : '#3d3b45'} className={on ? 'fg-blink' : ''} /><circle cy={-45} r={6} fill={on || done ? 'var(--go)' : '#3d3b45'} /></g>)
      break
    case 'gate':
      art = (<g><rect x={-40} y={-36} width={10} height={40} rx={3} fill="var(--solid)" /><rect x={30} y={-20} width={8} height={24} rx={3} fill="var(--solid)" />
        <motion.g animate={{ rotate: on || done ? -62 : 0 }} transition={spring} style={{ originX: '-35px', originY: '-28px' }}>
          <rect x={-35} y={-32} width={74} height={9} rx={4} fill="var(--yellow)" />
          {[0, 1, 2, 3].map((k) => <rect key={k} x={-24 + k * 16} y={-32} width={7} height={9} fill="var(--solid)" />)}
        </motion.g></g>)
      break
    case 'signposts':
      art = (<g>{[[-34, 34, 'var(--green)'], [0, 46, 'var(--blue)'], [34, 30, 'var(--orange)']].map(([dx, h, c], k) => (
        <motion.g key={k} transform={`translate(${dx} 0)`} animate={on ? { rotate: [0, -6, 4, 0] } : { rotate: 0 }} transition={{ duration: 1.2, repeat: on ? Infinity : 0, delay: k * 0.15 }}>
          {post(h as number)}<rect x={-14} y={-(h as number) - 6} width={28} height={14} rx={4} fill={c as string} />
        </motion.g>))}</g>)
      break
    case 'river':
      art = (<g>
        <path d="M-50 -2 C -36 14, -70 34, -60 50 S -92 70, -100 76 L 100 76 C 84 64, 50 52, 62 34 S 38 12, 50 -2 Z" fill={pal.edge} />
        <path d="M-42 -2 C -28 14, -60 34, -50 50 S -80 70, -86 76 L 86 76 C 72 64, 40 52, 52 34 S 30 12, 42 -2 Z" fill={pal.river} />
        {[[-14, 14, 0.8], [18, 26, 1], [-30, 44, 1.1], [10, 58, 1.3], [-40, 66, 1.2], [40, 48, 1]].map(([dx, yy, k], i) => (
          <g key={i} transform={`translate(${dx} ${yy})`}><g className="fg-ripple" style={{ animationDelay: `${-i * 0.4}s` }}>
            <path d={`M${-7 * k} 0 q${3.5 * k} ${-3 * k} ${7 * k} 0 t${7 * k} 0`} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
          </g></g>
        ))}
        <path d="M-62 0 Q0 -40 62 0" fill="none" stroke={pal.wood} strokeWidth={8} strokeLinecap="round" />
        <path d="M-56 -8 Q0 -48 56 -8" fill="none" stroke="var(--solid)" strokeWidth={2.5} />
        {[-40, -20, 0, 20, 40].map((dx) => <line key={dx} x1={dx} x2={dx} y1={-13 - 26 * (1 - (dx / 62) ** 2) + 2} y2={-5 - 26 * (1 - (dx / 62) ** 2) + 6} stroke="var(--solid)" strokeWidth={2.5} />)}
      </g>)
      break
    case 'forest':
      art = (<g>{[[-60, 0.8], [-34, 1.15], [-6, 0.9], [20, 1.3], [46, 0.85], [70, 1.05]].map(([dx, s], k) => (
        <motion.g key={k} animate={{ scale: on ? 1.08 : 1 }} transition={{ ...spring, delay: k * 0.05 }} style={{ originX: `${dx}px`, originY: '0px' }}>
          <Tree x={dx} y={0} s={s} pal={pal} />
        </motion.g>))}</g>)
      break
    case 'switchback':
      art = (<g><path d="M-80 4 Q-30 -70 0 -72 Q30 -70 80 4 Z" fill={pal.edge} />
        <motion.path d="M-56 -6 L30 -22 L-26 -40 L14 -58 L0 -70" fill="none" stroke={on || done ? 'var(--orange)' : 'var(--ink)'} strokeOpacity={on || done ? 1 : 0.35} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 6"
          initial={false} animate={{ pathLength: on || done ? 1 : 0.35 }} transition={{ duration: 0.9 }} /></g>)
      break
    case 'tower':
      art = (<g><path d="M-18 4 L-8 -60 M18 4 L8 -60 M-15 -16 L15 -16 M-12 -36 L12 -36" stroke="var(--solid)" strokeWidth={4} strokeLinecap="round" />
        <rect x={-16} y={-78} width={32} height={20} rx={3} fill={pal.wood} stroke="var(--solid)" strokeWidth={2.5} />
        <path d="M-22 -78 L0 -94 L22 -78 Z" fill="var(--green)" stroke="var(--solid)" strokeWidth={2.5} strokeLinejoin="round" />
        {on && <motion.path d="M10 -70 L80 -92 L80 -48 Z" fill="var(--yellow)" opacity={0.35} animate={{ rotate: [-14, 14, -14] }} transition={{ duration: 3, repeat: Infinity }} style={{ originX: '10px', originY: '-70px' }} />}</g>)
      break
    case 'cache':
      art = (<g><rect x={-26} y={-26} width={52} height={28} rx={4} fill={pal.wood} stroke="var(--solid)" strokeWidth={2.5} />
        <rect x={-14} y={-46} width={30} height={20} rx={3} fill="var(--yellow)" stroke="var(--solid)" strokeWidth={2.5} />
        <motion.rect x={-16} y={-52} width={34} height={7} rx={3} fill="var(--solid)" animate={{ rotate: on ? -28 : 0, y: on ? -4 : 0 }} transition={spring} style={{ originX: '-16px', originY: '-48px' }} />
        {on && [0, 1, 2].map((k) => <motion.rect key={k} x={-4 + k * 6} y={-50} width={5} height={5} rx={1} fill="var(--orange)" animate={{ y: [-50, -78], opacity: [1, 0] }} transition={{ duration: 1.1, repeat: Infinity, delay: k * 0.3 }} />)}</g>)
      break
    case 'camp':
      art = (<g><path d="M-48 2 L-18 -40 L12 2 Z" fill="var(--blue)" stroke="var(--solid)" strokeWidth={2.5} strokeLinejoin="round" /><path d="M-18 -40 L-24 2 H-12 Z" fill="var(--solid)" />
        <path d="M24 2 L44 -4 M24 -4 L44 2" stroke={pal.wood} strokeWidth={5} strokeLinecap="round" />
        <motion.path d="M34 -4 Q26 -18 34 -30 Q42 -18 34 -4 Z" fill="var(--orange)" animate={{ scaleY: on ? [1, 1.35, 0.9, 1.2, 1] : [1, 1.1, 1] }} transition={{ duration: on ? 0.8 : 1.6, repeat: Infinity }} style={{ originX: '34px', originY: '-4px' }} />
        <path d="M34 -6 Q30 -13 34 -19 Q38 -13 34 -6 Z" fill="var(--yellow)" /></g>)
      break
    case 'lake':
      art = (<g><ellipse cy={6} rx={78} ry={14} fill={pal.river} />
        {[0, 1].map((k) => <motion.ellipse key={k} cy={6} rx={20} ry={4} fill="none" stroke="#fff" strokeOpacity={0.7} strokeWidth={2} animate={{ scale: [0.4, 2.2], opacity: [0.9, 0] }} transition={{ duration: 2.6, repeat: Infinity, delay: k * 1.3 }} />)}
        <motion.g animate={{ x: on ? [-30, 30, -30] : 0, y: [0, -1.5, 0] }} transition={{ duration: on ? 6 : 2, repeat: Infinity, ease: 'easeInOut' }}>
          <path d="M-14 0 H14 L8 6 H-8 Z" fill={pal.wood} stroke="var(--solid)" strokeWidth={2} /><path d="M0 0 V-20 L12 -4 Z" fill="var(--surface)" stroke="var(--solid)" strokeWidth={2} strokeLinejoin="round" />
        </motion.g></g>)
      break
    case 'ridge':
      art = (<g><path d="M-70 4 L-40 -40 L-22 -20 L0 -64 L24 -26 L42 -44 L70 4 Z" fill={pal.rock} />
        <path d="M0 -64 L-10 -44 L-2 -48 L6 -42 L10 -46 Z M-40 -40 L-46 -30 L-38 -32 L-34 -30 Z" fill={pal.snow} />
        {on && <motion.g animate={{ x: [-10, 40], y: [-70, -84], opacity: [0, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity }}><path d="M0 0 q5 -5 9 0 q4 -5 9 0" fill="none" stroke="var(--ink)" strokeWidth={2} /></motion.g>}</g>)
      break
    case 'hut':
      art = (<g><rect x={-26} y={-34} width={52} height={36} rx={3} fill={pal.wood} stroke="var(--solid)" strokeWidth={2.5} />
        <path d="M-34 -32 L0 -60 L34 -32 Z" fill="var(--green)" stroke="var(--solid)" strokeWidth={2.5} strokeLinejoin="round" />
        <rect x={14} y={-62} width={9} height={18} fill="var(--solid)" /><rect x={-8} y={-20} width={16} height={22} rx={2} fill="var(--solid)" />
        <rect x={-20} y={-26} width={10} height={9} rx={2} fill={on ? 'var(--yellow)' : 'var(--surface)'} />
        {[0, 1, 2].map((k) => <motion.circle key={k} cx={18} cy={-66} r={5} fill="var(--surface)" animate={{ cy: [-66, -98], cx: [18, 30], r: [4, 9], opacity: [0.9, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: k * 0.8 }} />)}</g>)
      break
    case 'summit':
      art = (<g><path d="M-120 6 L-40 -70 L-18 -54 L10 -112 L60 -50 L120 6 Z" fill={pal.mid} /><path d="M10 -112 L60 -50 L120 6 L30 6 Z" fill={pal.far} />
        <path d="M10 -112 L-6 -82 L4 -86 L12 -78 L22 -86 L30 -82 Z" fill={pal.snow} />
        <rect x={8} y={-150} width={4} height={40} fill="var(--solid)" />
        <motion.path d="M12 -150 L40 -142 L12 -132 Z" fill="var(--orange)" animate={{ scaleX: on ? [1, 0.8, 1] : 1 }} transition={{ duration: 1, repeat: Infinity }} style={{ originX: '12px' }} /></g>)
      break
  }
  return (
    <g transform={`translate(${x} ${y.toFixed(1)})`}>
      <motion.g initial={false} animate={{ scale: on ? 1.12 : 1, y: on ? -3 : 0 }} transition={spring} style={{ originX: '0px', originY: '0px' }}>
        {art}
      </motion.g>
    </g>
  )
}
