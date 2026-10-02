import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { useId, useMemo, useRef, useState } from 'react'

/* The folder as a trail map, drawn as a little diorama: a slab of meadow with a soil edge, set under a sky with
   layered ridges like the homepage. Subfolders are raised plateaus, files are pins, and a dashed trail walks from
   region to region. Mountains, forests, a river and a grid make it read as a map; the grid gives every place a
   reference (B3) that the gazetteer under the map shares. Depth is only hinted: extruded edges, cast shadows,
   clouds whose shadows slide over the ground, and ridges that shift a little with scroll and the pointer.
   Clicking a region zooms into it and the next folder unfolds. */

export type MapChild = { id: string; name: string; kind: string; summary: string; annotations: Record<string, string> }
export type Place = MapChild & { x: number; y: number; r: number; ref: string; fill: string; blob: string }

export const W = 1000
export const H = 600
const SKY = 156 // sky band above the land
const SLAB = 26 // the slab's front edge below it
const LX = 12 // the slab sits slightly in from the sheet's sides
const VH = SKY + H + SLAB + 10
const M = 64
const COLS = 'ABCDEFGH'
const ROWS = 5
const MAX = 48
const TERRAIN = ['var(--mint)', 'var(--butter)', 'var(--lilac)', 'var(--peach)', 'var(--sky)', 'var(--limeade)']
const PINS = ['var(--orange)', 'var(--blue)', 'var(--violet)', 'var(--green)', 'var(--yellow)']

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}
const rnd = (seed: string, k: string | number) => hash(`${seed}:${k}`)

type Pt = [number, number]
/** A smooth curve through points (Catmull-Rom as cubic Béziers), closed or open. */
function smooth(pts: Pt[], closed: boolean): string {
  if (pts.length < 2) return ''
  const at = (i: number): Pt => (closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))])
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`
  const n = closed ? pts.length : pts.length - 1
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return closed ? `${d} Z` : d
}
const blobAt = (seed: string, x: number, y: number, r: number, wobble = 0.35) =>
  smooth(Array.from({ length: 9 }, (_, i): Pt => {
    const a = (i / 9) * Math.PI * 2
    const k = r * (1 - wobble / 2 + wobble * rnd(seed, i))
    return [x + Math.cos(a) * k, y + Math.sin(a) * k * 0.82]
  }), true)

export const refAt = (x: number, y: number) => `${COLS[Math.min(COLS.length - 1, Math.floor((x / W) * COLS.length))]}${Math.min(ROWS, Math.floor((y / H) * ROWS) + 1)}`

/** Where everything goes. Deterministic per folder, so the map looks the same every visit. */
export function layoutPlaces(children: MapChild[], seed: string) {
  const items = [...children].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1)).slice(0, MAX)
  const n = Math.max(1, items.length)
  const cols = Math.max(1, Math.min(9, Math.round(Math.sqrt((n * W) / H))))
  const rows = Math.ceil(n / cols)
  const cw = (W - M * 2) / cols
  const ch = (H - M * 2) / rows
  const layers = [...new Set(items.map((c) => c.annotations.layer).filter(Boolean))]
  // Shuffle which cell each item lands in, so folders do not all sit in the top row.
  const cells = items.map((_, i) => i).sort((a, b) => rnd(seed, `c${a}`) - rnd(seed, `c${b}`))
  const places: Place[] = items.map((c, i) => {
    const cell = cells[i]
    const col = cell % cols
    const row = Math.floor(cell / cols)
    const x = M + (col + 0.5) * cw + (rnd(c.id, 'x') - 0.5) * cw * 0.34
    const y = M + (row + 0.5) * ch + (rnd(c.id, 'y') - 0.5) * ch * 0.3
    const r = c.kind === 'dir' ? Math.max(24, Math.min(74, Math.min(cw, ch) * 0.38)) : 9
    const li = c.annotations.layer ? layers.indexOf(c.annotations.layer) : -1
    const fill = c.kind === 'dir' ? TERRAIN[(li >= 0 ? li : Math.floor(rnd(c.id, 't') * TERRAIN.length)) % TERRAIN.length] : PINS[Math.floor(hash(c.name.split('.').pop() ?? '') * PINS.length)]
    return { ...c, x, y, r, ref: refAt(x, y), fill, blob: c.kind === 'dir' ? blobAt(c.id, x, y, r) : '' }
  })
  // The trail: a nearest-neighbour walk through the regions (or the first pins if there are few regions).
  const stops = places.filter((p) => p.kind === 'dir')
  const pool = (stops.length >= 2 ? stops : places).slice()
  const walk: Place[] = []
  let cur = pool.sort((a, b) => a.x - b.x).shift()
  while (cur) {
    walk.push(cur)
    const from: Place = cur
    pool.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))
    cur = pool.shift()
  }
  const trail = walk.length > 1 ? smooth([[walk[0].x - 60, walk[0].y + 30], ...walk.map((p): Pt => [p.x, p.y + (p.kind === 'dir' ? p.r * 0.95 : 14)])], false) : ''
  // The river runs along a gap between two rows, so it never sits under a pin.
  const gapRow = Math.max(1, Math.min(rows - 1, Math.round(rows / 2)))
  const ry0 = rows > 1 ? M + gapRow * ch : H - M / 2
  const ry = (k: number) => ry0 + (rnd(seed, `r${k}`) - 0.5) * 16
  const riverPts: Pt[] = [[-20, ry(0)], [W * 0.25, ry(1)], [W * 0.5, ry(2)], [W * 0.75, ry(3)], [W + 20, ry(4)]]
  const river = smooth(riverPts, false)
  const riverY = (x: number) => {
    const i = Math.max(0, Math.min(riverPts.length - 2, Math.floor((x + 20) / ((W + 40) / (riverPts.length - 1)))))
    const t = (x - riverPts[i][0]) / (riverPts[i + 1][0] - riverPts[i][0])
    return riverPts[i][1] + (riverPts[i + 1][1] - riverPts[i][1]) * Math.max(0, Math.min(1, t))
  }
  // Open ground: how far each point is from the nearest place (pins keep room for their label below).
  const clear = (x: number, y: number) => Math.min(
    ...places.map((p) => (p.kind === 'dir' ? Math.hypot(x - p.x, (y - p.y) * 1.15) - p.r : Math.hypot((x - p.x) * 0.8, y - (p.y - 4)) - 26)),
    Math.abs(y - riverY(x)) - 14,
  )
  const spots: { x: number; y: number; c: number }[] = []
  for (let y = 30; y < H - 16; y += 26) for (let x = 24; x < W - 20; x += 30) {
    const jx = x + (rnd(seed, `jx${x}-${y}`) - 0.5) * 18
    const jy = y + (rnd(seed, `jy${x}-${y}`) - 0.5) * 14
    spots.push({ x: jx, y: jy, c: clear(jx, jy) })
  }
  const mountains: { x: number; y: number; peaks: { dx: number; w: number; h: number }[] }[] = []
  for (const sp of [...spots].sort((p, q) => q.c - p.c)) {
    if (mountains.length >= 3 || sp.c < 48) break
    if (sp.y < 70 || sp.x < 110 || sp.x > W - 110) continue // leave the compass alone
    if (mountains.some((m) => Math.hypot(m.x - sp.x, m.y - sp.y) < 170)) continue
    const size = Math.min(95, sp.c)
    if (sp.y + size * 0.35 > H - 30 || sp.y - size * 0.9 < 28) continue
    const count = 2 + Math.floor(rnd(seed, `mc${sp.x}`) * 2)
    mountains.push({
      x: sp.x, y: sp.y + size * 0.35,
      peaks: Array.from({ length: count }, (_, k) => ({ dx: (k - (count - 1) / 2) * size * 0.62 + (rnd(seed, `md${k}${sp.x}`) - 0.5) * 12, w: size * (0.9 + rnd(seed, `mw${k}${sp.y}`) * 0.5), h: size * (0.7 + rnd(seed, `mh${k}${sp.x}`) * 0.5) * (k === Math.floor(count / 2) ? 1.15 : 0.85) })),
    })
  }
  const inMountain = (x: number, y: number) => mountains.some((m) => Math.abs(x - m.x) < 110 && y < m.y + 10 && y > m.y - 120)
  const trees = spots
    .filter((sp) => sp.c > 14 && !inMountain(sp.x, sp.y) && !(sp.x > W - 120 && sp.y < 130) && rnd(seed, `f${Math.floor(sp.x / 150)}-${Math.floor(sp.y / 120)}`) > 0.5 && rnd(seed, `t${sp.x}-${sp.y}`) > 0.45)
    .map((sp) => ({ x: sp.x, y: sp.y, s: 0.75 + rnd(seed, `ts${sp.x}${sp.y}`) * 0.55, pine: rnd(seed, `tp${sp.x}${sp.y}`) > 0.4 }))
    .sort((p, q) => p.y - q.y)
  const tufts = spots.filter((sp) => sp.c > 6 && sp.c <= 14 && rnd(seed, `g${sp.x}${sp.y}`) > 0.5).slice(0, 40)
  const clouds = [0, 1, 2, 3].map((k) => ({ x: W * (0.1 + 0.26 * k) + (rnd(seed, `cx${k}`) - 0.5) * 80, y: 50 + rnd(seed, `cy${k}`) * (H * 0.6), s: 0.8 + rnd(seed, `cs${k}`) * 0.6, d: 70 + rnd(seed, `cd${k}`) * 50 }))
  const ripples = [0.18, 0.52, 0.83].map((f, k) => { const x = W * f + (rnd(seed, `rp${k}`) - 0.5) * 60; return { x, y: riverY(x) } })
  return { places, trail, river, ripples, mountains, trees, tufts, clouds, hidden: Math.max(0, children.length - MAX), layers }
}

/** The horizon: a far range of sharp peaks with snow on the tallest, and a rounder near range in front. */
function horizon(seed: string) {
  const far: Pt[] = []
  for (let x = -40, i = 0; x <= W + 60; x += 52 + rnd(seed, `hf${i}`) * 30, i++) far.push([x, i % 2 ? SKY - 30 - rnd(seed, `hv${i}`) * 24 : SKY - 66 - rnd(seed, `hp${i}`) * 62])
  const snow = far.flatMap((p, i) => {
    if (i % 2 || i === 0 || i === far.length - 1 || p[1] > SKY - 92) return []
    const [l, r] = [far[i - 1], far[i + 1]]
    const k = 15 / (l[1] - p[1])
    const q = 15 / (r[1] - p[1])
    const a: Pt = [p[0] + (l[0] - p[0]) * k, p[1] + 15]
    const b: Pt = [p[0] + (r[0] - p[0]) * q, p[1] + 15]
    return [`M${a[0].toFixed(1)} ${a[1].toFixed(1)} L${p[0].toFixed(1)} ${p[1].toFixed(1)} L${b[0].toFixed(1)} ${b[1].toFixed(1)} L${(p[0] + 4).toFixed(1)} ${(p[1] + 9).toFixed(1)} L${(p[0] - 3).toFixed(1)} ${(p[1] + 14).toFixed(1)} Z`]
  })
  const near: Pt[] = []
  for (let x = -60, i = 0; x <= W + 80; x += 110 + rnd(seed, `hn${i}`) * 60, i++) near.push([x, SKY - 10 - rnd(seed, `hh${i}`) * 44])
  const base = SKY + 12
  return {
    far: `M-40 ${base} ${far.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L${W + 60} ${base} Z`,
    snow,
    near: `${smooth(near, false)} L${W + 80} ${base} L-60 ${base} Z`,
  }
}

export function TrailMap({ items, seed, label, picked, hover, onHover, onOpen, onPick }: {
  items: MapChild[]
  seed: string
  label: string
  picked: string
  hover: string
  onHover: (id: string) => void
  onOpen: (id: string) => void
  onPick: (id: string) => void
}) {
  const reduce = useReducedMotion()
  const map = useMemo(() => layoutPlaces(items, seed), [items, seed])
  const frame = useRef<HTMLDivElement>(null)
  const trailRef = useRef<SVGPathElement>(null)
  const [zoom, setZoom] = useState<Place | null>(null)
  const [flag, setFlag] = useState<Pt | null>(null)
  const { scrollYProgress } = useScroll({ target: frame, offset: ['start end', 'end start'] })
  const prog = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  const draw = useTransform(prog, [0.15, 0.6], [0, 1])
  const turn = useTransform(prog, [0, 1], [-70, 70])
  const flow = useTransform(prog, [0, 1], [0, -120])
  const rise = useTransform(prog, [0, 0.5, 1], [6, 0, -10])
  const breeze = useTransform(prog, [0, 1], [-60, 60])
  const breezeBack = useTransform(prog, [0, 1], [50, -50])
  const sky = useMemo(() => horizon(seed), [seed])
  const farY = useTransform(prog, [0, 1], [10, -6])
  const nearY = useTransform(prog, [0, 1], [18, -10])
  // A light pointer parallax: far things move least, things in the air most.
  const px = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 60, damping: 18 })
  const farX = useTransform(sx, (v) => v * -4)
  const nearX = useTransform(sx, (v) => v * -9)
  const airX = useTransform(sx, (v) => v * 12)
  const uid = useId().replace(/:/g, '')
  const maskId = `tm-trail-${uid}`
  const clipId = `tm-land-${uid}`
  useMotionValueEvent(draw, 'change', (v) => {
    const el = trailRef.current
    if (!el || reduce) return
    const len = el.getTotalLength()
    const p = el.getPointAtLength(Math.max(0, Math.min(1, v)) * len)
    setFlag([p.x, p.y])
  })
  const here = map.places.find((p) => p.id === picked)
  const tip = map.places.find((p) => p.id === hover)
  const zoomBox = zoom ? `${zoom.x - zoom.r * 2.4} ${SKY + zoom.y - zoom.r * 1.44} ${zoom.r * 4.8} ${zoom.r * 2.88}` : `0 0 ${W} ${VH}`
  const DEPTH = 9

  return (
    <div
      className="tm"
      ref={frame}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        px.set(((e.clientX - r.left) / r.width - 0.5) * 2)
      }}
      onPointerLeave={() => px.set(0)}
    >
      <motion.div className="tm-sheet" initial={reduce ? false : { rotateX: -64, y: -12 }} animate={{ rotateX: 0, y: 0 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
        <motion.svg
          viewBox={`0 0 ${W} ${VH}`}
          animate={{ viewBox: zoomBox }}
          transition={{ duration: zoom ? 0.6 : 0, ease: [0.6, 0, 0.3, 1] }}
          onAnimationComplete={() => { if (zoom) { const id = zoom.id; setZoom(null); onOpen(id) } }}
          className="tm-svg"
          role="img"
          aria-label={`Map of ${label}`}
        >
          <defs>
            <clipPath id={clipId}><rect x={LX} y={0} width={W - LX * 2} height={H} rx={26} /></clipPath>
          </defs>

          {/* sky: sun, far range, near range, a flock */}
          <g className="tm-sky">
            <motion.g style={{ x: reduce ? 0 : farX, y: reduce ? 0 : farY }}>
              <circle cx={W * 0.8} cy={SKY - 104} r={26} className="tm-sun" />
              <path d={sky.far} className="tm-far" />
              {sky.snow.map((d, i) => <path key={i} d={d} className="tm-far__snow" />)}
            </motion.g>
            {!reduce && map.clouds.slice(0, 2).map((c, i) => (
              <g key={i} className="tm-drift" style={{ animationDuration: `${c.d * 1.6}s`, animationDelay: `${-c.d * 1.6 * (c.x / W)}s` }}>
                <g transform={`translate(0 ${SKY - 132 + i * 38}) scale(${(c.s * 0.6).toFixed(2)})`}>
                  <path d="M-34 8 A12 12 0 0 1 -22 -6 A16 16 0 0 1 6 -12 A14 14 0 0 1 30 -2 A10 10 0 0 1 34 8 Z" className="tm-cloud" />
                </g>
              </g>
            ))}
            <motion.g style={{ x: reduce ? 0 : nearX, y: reduce ? 0 : nearY }}>
              <path d={sky.near} className="tm-near" />
            </motion.g>
            {!reduce && (
              <g className="tm-flock">
                {[[0, 0], [16, 7], [-14, 9], [30, 15]].map(([x, y], i) => (
                  <g key={i} transform={`translate(${x} ${SKY - 128 + y})`}>
                    <path d="M-6 0 Q-3 -4 0 0 Q3 -4 6 0" className="tm-bird" style={{ animationDelay: `${i * -0.17}s` }} />
                  </g>
                ))}
              </g>
            )}
          </g>

          {/* the slab: soil, a grass edge, then the land on top */}
          <rect x={LX} y={SKY + 20} width={W - LX * 2} height={H + SLAB - 20} rx={26} className="tm-slab__soil" />
          <path d={`M${LX + 30} ${SKY + H + 15} H${W - LX - 30} M${LX + 60} ${SKY + H + 21} H${W - LX - 90}`} className="tm-slab__strata" />
          <rect x={LX} y={SKY + 8} width={W - LX * 2} height={H + 4} rx={26} className="tm-slab__edge" />
          <rect x={LX} y={SKY} width={W - LX * 2} height={H} rx={26} className="tm-slab__top" />

          <g transform={`translate(0 ${SKY})`}>
          <g clipPath={`url(#${clipId})`}>
          {/* grid and its references */}
          <g className="tm-grid">
            {Array.from({ length: COLS.length - 1 }, (_, i) => <line key={`v${i}`} x1={((i + 1) * W) / COLS.length} x2={((i + 1) * W) / COLS.length} y1={0} y2={H} />)}
            {Array.from({ length: ROWS - 1 }, (_, i) => <line key={`h${i}`} y1={((i + 1) * H) / ROWS} y2={((i + 1) * H) / ROWS} x1={0} x2={W} />)}
            {COLS.split('').map((c, i) => <text key={c} x={((i + 0.5) * W) / COLS.length} y={18}>{c}</text>)}
            {Array.from({ length: ROWS }, (_, i) => <text key={i} x={12} y={((i + 0.5) * H) / ROWS + 4}>{i + 1}</text>)}
          </g>

          <g className="tm-river">
            <path d={map.river} className="tm-river__bank" />
            <path d={map.river} className="tm-river__bed" />
            <motion.path d={map.river} className="tm-river__flow" style={{ strokeDashoffset: reduce ? 0 : flow }} />
            {!reduce && map.ripples.map((r, i) => (
              <g key={i} transform={`translate(${r.x.toFixed(1)} ${r.y.toFixed(1)})`}>
                <ellipse rx={7} ry={2.6} className="tm-ripple" style={{ animationDelay: `${i * -1.1}s` }} />
                <ellipse rx={7} ry={2.6} className="tm-ripple" style={{ animationDelay: `${i * -1.1 - 1.6}s` }} />
              </g>
            ))}
          </g>

          <g className="tm-tufts">
            {map.tufts.map((t, i) => <path key={i} d={`M${t.x - 5} ${t.y} l2 -6 l2 6 l2 -8 l2 8 l2 -5`} />)}
          </g>
          </g>

          <motion.g className="tm-mountains" style={{ y: reduce ? 0 : rise }}>
            {map.mountains.map((m, i) => (
              <g key={i}>
                {[1, 2, 3].map((j) => <ellipse key={j} cx={m.x} cy={m.y + 4} rx={60 + j * 26} ry={14 + j * 9} className="tm-contour" />)}
                {[...m.peaks].sort((p, q) => p.h - q.h).map((pk, k) => {
                  const x = m.x + pk.dx
                  const top = m.y - pk.h
                  const cap = pk.h * 0.3
                  return (
                    <g key={k}>
                      <path d={`M${x - pk.w / 2} ${m.y} L${x} ${top} L${x + pk.w / 2} ${m.y} Z`} className="tm-peak" />
                      <path d={`M${x} ${top} L${x + pk.w / 2} ${m.y} L${x + pk.w * 0.08} ${m.y} Z`} className="tm-peak__shade" />
                      <path d={`M${x - (pk.w / 2) * (cap / pk.h)} ${top + cap} L${x} ${top} L${x + (pk.w / 2) * (cap / pk.h)} ${top + cap} L${x + pk.w * 0.05} ${top + cap * 0.7} L${x - pk.w * 0.03} ${top + cap * 1.05} L${x - pk.w * 0.1} ${top + cap * 0.75} Z`} className="tm-peak__snow" />
                      <path d={`M${x - pk.w / 2} ${m.y} L${x} ${top} L${x + pk.w / 2} ${m.y}`} className="tm-peak__line" />
                    </g>
                  )
                })}
              </g>
            ))}
          </motion.g>

          <g className="tm-trees">
            {map.trees.map((t, i) => (
              <g key={i} transform={`translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) scale(${t.s.toFixed(2)})`}>
                <g className="tm-tree" style={{ animationDelay: `${(i % 7) * -0.4}s` }}>
                  <ellipse cy={1} rx={7} ry={2.2} className="tm-tree__shadow" />
                  <path d="M0 1 V-6" className="tm-tree__trunk" />
                  {t.pine ? (
                    <path d="M0 -26 L7 -15 H4 L9 -6 H-9 L-4 -15 H-7 Z" className="tm-tree__pine" />
                  ) : (
                    <circle cy={-13} r={8.5} className="tm-tree__round" />
                  )}
                </g>
              </g>
            ))}
          </g>

          {map.trail && (
            <>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <motion.path ref={trailRef} d={map.trail} stroke="#fff" strokeWidth={14} fill="none" strokeLinecap="round" style={{ pathLength: reduce ? 1 : draw }} />
              </mask>
              <path d={map.trail} className="tm-trail__ghost" />
              <path d={map.trail} className="tm-trail" mask={`url(#${maskId})`} />
            </>
          )}

          {map.places.filter((p) => p.kind === 'dir').map((p, i) => (
            <motion.g
              key={p.id}
              className={`tm-region ${hover === p.id ? 'is-hover' : ''}`}
              onClick={() => setZoom(p)}
              onPointerEnter={() => onHover(p.id)}
              onPointerLeave={() => onHover('')}
              data-cursor={`Enter ${p.name}/`}
              initial={reduce ? false : { scale: 0.6, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 + i * 0.04 }}
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            >
              <path d={p.blob} transform={`translate(7 ${DEPTH + 6})`} className="tm-region__shadow" />
              <path d={p.blob} transform={`translate(0 ${DEPTH})`} style={{ fill: `color-mix(in srgb, ${p.fill} 66%, #17161b)` }} className="tm-region__side" />
              {[0.8, 0.6, 0.4, 0.2].map((f) => <path key={f} d={p.blob} transform={`translate(0 ${(DEPTH * f).toFixed(1)})`} style={{ fill: `color-mix(in srgb, ${p.fill} 66%, #17161b)` }} className="tm-region__fill" />)}
              <path d={p.blob} style={{ fill: p.fill }} className="tm-region__land" />
              <path d={blobAt(`${p.id}i`, p.x, p.y, p.r * 0.55, 0.3)} className="tm-region__ring" />
              <text x={p.x} y={p.y + 5} className="tm-region__name" style={{ fontSize: Math.max(10, Math.min(15, (p.r * 2.1) / Math.max(5, Math.min(p.name.length, 12)) * 1.6)) }}>{p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}</text>
              <text x={p.x} y={p.y + 21} className="tm-region__ref">{p.ref}</text>
            </motion.g>
          ))}

          {map.places.filter((p) => p.kind !== 'dir').map((p, i) => (
            <motion.g
              key={p.id}
              className={`tm-pin ${picked === p.id ? 'is-here' : ''} ${hover === p.id ? 'is-hover' : ''}`}
              onClick={() => onPick(p.id)}
              onPointerEnter={() => onHover(p.id)}
              onPointerLeave={() => onHover('')}
              data-cursor={`Inspect ${p.name}`}
              initial={reduce ? false : { y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.3 + Math.min(i, 30) * 0.025 }}
            >
              <ellipse cx={p.x} cy={p.y + 2} rx={6} ry={2.4} className="tm-pin__shadow" />
              <path d={`M${p.x} ${p.y} C${p.x - 3} ${p.y - 7} ${p.x - 10} ${p.y - 11} ${p.x - 10} ${p.y - 19} A10 10 0 1 1 ${p.x + 10} ${p.y - 19} C${p.x + 10} ${p.y - 11} ${p.x + 3} ${p.y - 7} ${p.x} ${p.y} Z`} style={{ fill: p.fill }} className="tm-pin__head" />
              <circle cx={p.x} cy={p.y - 19} r={3.6} className="tm-pin__dot" />
              {map.places.length <= 22 && <text x={p.x} y={p.y + 16} className="tm-pin__name">{p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name}</text>}
            </motion.g>
          ))}

          {here && (
            <g className="tm-here" transform={`translate(${here.x} ${here.y - 19})`}>
              <circle r={16} className="tm-here__ring" />
              <circle r={16} className="tm-here__ring is-late" />
            </g>
          )}

          {flag && map.trail && (
            <g transform={`translate(${flag[0]} ${flag[1]})`} className="tm-flag">
              <circle r={6} className="tm-flag__foot" />
              <path d="M0 0 V-30" className="tm-flag__pole" />
              <path d="M0 -30 L18 -24 L0 -18 Z" className="tm-flag__cloth" />
            </g>
          )}

          <motion.g className="tm-compass" style={{ rotate: reduce ? 0 : turn, transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx={W - 62} cy={66} r={34} className="tm-compass__dial" />
            <path d={`M${W - 62} 36 L${W - 54} 66 L${W - 62} 96 L${W - 70} 66 Z`} className="tm-compass__needle" />
            <path d={`M${W - 62} 36 L${W - 54} 66 L${W - 70} 66 Z`} className="tm-compass__north" />
            <text x={W - 62} y={28} className="tm-compass__n">N</text>
          </motion.g>

          {/* things in the air: clouds whose shadows slide over the ground, and a balloon */}
          <motion.g className="tm-clouds" style={{ x: reduce ? 0 : airX }}>
            {map.clouds.map((c, i) => (
              <motion.g key={i} style={{ x: reduce ? 0 : i % 2 ? breeze : breezeBack }}>
                <g className={reduce ? undefined : 'tm-drift'} transform={reduce ? `translate(${c.x.toFixed(0)} 0)` : undefined} style={reduce ? undefined : { animationDuration: `${c.d}s`, animationDelay: `${-c.d * (c.x / W)}s` }}>
                  <g transform={`translate(0 ${c.y.toFixed(0)})`}>
                    <ellipse cy={54 * c.s} rx={36 * c.s} ry={9 * c.s} className="tm-cloud__shadow" />
                    <g transform={`scale(${c.s.toFixed(2)})`}>
                      <path d="M-34 8 A12 12 0 0 1 -22 -6 A16 16 0 0 1 6 -12 A14 14 0 0 1 30 -2 A10 10 0 0 1 34 8 Z" className="tm-cloud" />
                    </g>
                  </g>
                </g>
              </motion.g>
            ))}
            {!reduce && (
              <g className="tm-drift is-slow" style={{ animationDelay: `${-140 * rnd(seed, 'balloon')}s` }}>
                <g transform={`translate(0 ${(H * (0.22 + rnd(seed, 'by') * 0.3)).toFixed(0)})`}>
                  <ellipse cy={78} rx={11} ry={3.4} className="tm-cloud__shadow" />
                  <g className="tm-balloon">
                    <path d="M-5 13 L-4 21 M5 13 L4 21" className="tm-balloon__rope" />
                    <rect x={-5} y={20} width={10} height={7} rx={2} className="tm-balloon__basket" />
                    <path d="M0 -24 C14 -24 18 -12 15 -3 C12 6 5 10 4 14 H-4 C-5 10 -12 6 -15 -3 C-18 -12 -14 -24 0 -24 Z" className="tm-balloon__top" />
                    <path d="M0 -24 C6 -24 7 -12 6 -3 C5 6 3 10 2 14 H-2 C-3 10 -5 6 -6 -3 C-7 -12 -6 -24 0 -24 Z" className="tm-balloon__band" />
                  </g>
                </g>
              </g>
            )}
          </motion.g>

          <g className="tm-scale" transform={`translate(28 ${H - 30})`}>
            <rect width={40} height={8} className="is-a" />
            <rect x={40} width={40} height={8} className="is-b" />
            <rect x={80} width={40} height={8} className="is-a" />
            <text y={-6}>{map.places.length} places · grid squares are the references below</text>
          </g>
          </g>
        </motion.svg>

        {tip && (
          <div className="tm-tip" style={{ left: `${(tip.x / W) * 100}%`, top: `${((SKY + tip.y - (tip.kind === 'dir' ? tip.r * 0.8 : 34)) / VH) * 100}%` }}>
            <b>{tip.name}{tip.kind === 'dir' ? '/' : ''} <i>{tip.ref}</i></b>
            <span>{tip.summary || 'No summary yet.'}</span>
          </div>
        )}
      </motion.div>

      <div className="tm-legend">
        <span><svg viewBox="0 0 28 20" aria-hidden><path d={blobAt('legend', 14, 10, 9)} style={{ fill: 'var(--mint)' }} className="tm-region__land" /></svg>Folder · click to enter</span>
        <span><svg viewBox="0 0 20 24" aria-hidden><path d="M10 22 C7 15 0 11 0 9 A10 10 0 1 1 20 9 C20 11 13 15 10 22 Z" style={{ fill: 'var(--orange)' }} className="tm-pin__head" /></svg>File · click to inspect</span>
        <span><svg viewBox="0 0 34 10" aria-hidden><path d="M2 5 H32" className="tm-trail" style={{ strokeWidth: 3 }} /></svg>A walk between folders</span>
        {map.layers.length > 1 && map.layers.slice(0, 5).map((l, i) => <span key={l}><i className="tm-swatch" style={{ background: TERRAIN[i % TERRAIN.length] }} />{l.replace(/_/g, ' ')}</span>)}
        {map.hidden > 0 && <span className="tm-legend__more">{map.hidden} more in the gazetteer below</span>}
      </div>
    </div>
  )
}
