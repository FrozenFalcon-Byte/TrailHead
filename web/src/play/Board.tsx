import { useEffect, useRef, useState } from 'react'
import {
  COUNTDOWN_MS, MARKER_IDS, SIZE, TICK_MS, addBot, newGame, newRound, tick, xy,
  type Dir, type Game, type MarkerId, type Player, type Power,
} from './logic'

/* The arena, drawn on a canvas. The referee moves everyone one cell per tick; between ticks each marker glides
   along its newest cells so the motion reads as continuous. Crashes burst, pickups pulse, and the board shakes
   when you are the one who crashed. */

type Colors = Record<MarkerId, string> & { ink: string; ground: string; dot: string; paper: string; butter: string; sky: string; lilac: string; peach: string }
const VARS: Record<keyof Colors, string> = {
  orange: '--orange', blue: '--blue', green: '--green', violet: '--violet', yellow: '--yellow', lime: '--lime',
  ink: '--ink', ground: '--mint', dot: '--ink', paper: '--paper', butter: '--butter', sky: '--sky', lilac: '--lilac', peach: '--peach',
}
function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement)
  const out = {} as Colors
  ;(Object.keys(VARS) as (keyof Colors)[]).forEach((k) => (out[k] = cs.getPropertyValue(VARS[k]).trim() || '#888'))
  return out
}
const POWER_BG: Record<Power, keyof Colors> = { boost: 'butter', ghost: 'sky', revert: 'lilac' }

type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; r: number }
type Ring = { x: number; y: number; r: number; to: number; life: number; max: number; color: string }

export function Board({ game, me, onSwipe, className }: { game: Game; me?: string; onSwipe?: (d: Dir) => void; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ g: game, prev: null as Game | null, at: performance.now() })
  const fx = useRef({ sparks: [] as Spark[], rings: [] as Ring[], shake: 0, seen: null as Set<string> | null })
  const meRef = useRef(me)
  meRef.current = me
  const [px, setPx] = useState(0)

  // a new state: remember the one before it so the newest cells can be eased in
  useEffect(() => {
    const s = state.current
    if (game === s.g) return
    s.prev = s.g
    s.g = game
    s.at = performance.now()
    const f = fx.current
    if (!f.seen || game.round !== s.prev?.round) f.seen = new Set(game.events.map((e) => e.id))
    const colors = readColors()
    for (const e of game.events) {
      if (f.seen.has(e.id)) continue
      f.seen.add(e.id)
      const p = game.players.find((q) => q.id === e.who)
      const color = p ? colors[p.marker] : colors.ink
      const [x, y] = xy(e.cell)
      if (e.t === 'crash') {
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2
          const v = 0.04 + Math.random() * 0.16
          f.sparks.push({ x: x + 0.5, y: y + 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 40 + Math.random() * 30, color: i % 3 ? color : colors.ink, r: 0.18 + Math.random() * 0.28 })
        }
        f.rings.push({ x: x + 0.5, y: y + 0.5, r: 0.5, to: 4, life: 0, max: 30, color })
        if (e.who === meRef.current) f.shake = 1
      } else {
        f.rings.push({ x: x + 0.5, y: y + 0.5, r: 0.5, to: e.kind === 'revert' ? 3.5 + 0.5 : 2.4, life: 0, max: e.kind === 'revert' ? 34 : 22, color: e.kind === 'revert' ? colors.violet : color })
      }
    }
  }, [game])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setPx(Math.floor(el.clientWidth)))
    ro.observe(el)
    setPx(Math.floor(el.clientWidth))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvas.current
    if (!cv || !px) return
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    cv.width = Math.round(px * dpr)
    cv.height = Math.round(px * dpr)
    const ctx = cv.getContext('2d')!
    let colors = readColors()
    let frame = 0
    let raf = 0
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = () => {
      raf = requestAnimationFrame(draw)
      if (++frame % 60 === 0) colors = readColors() // follows the theme switch
      const { g, prev, at } = state.current
      const now = performance.now()
      const t = Math.min(1, (now - at) / TICK_MS)
      // the arena sits inside a margin, so markers on the edge cells and the fence corners are never cut off
      const M = Math.max(8, Math.round(px * 0.025))
      const W = px - M * 2
      const C = W / SIZE
      const f = fx.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, px, px)
      ctx.translate(M, M)
      if (f.shake > 0.01 && !reduce) {
        ctx.translate((Math.random() - 0.5) * 10 * f.shake, (Math.random() - 0.5) * 10 * f.shake)
        f.shake *= 0.88
      }
      // ground and the dot grid
      ctx.fillStyle = colors.ground
      roundRect(ctx, -M * 0.6, -M * 0.6, W + M * 1.2, W + M * 1.2, M * 1.6)
      ctx.fill()
      ctx.fillStyle = colors.dot
      ctx.globalAlpha = 0.13
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        ctx.beginPath()
        ctx.arc((x + 0.5) * C, (y + 0.5) * C, Math.max(0.8, C * 0.07), 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // pickups
      for (const k of g.pickups) {
        const [x, y] = xy(k.cell)
        const s = 1 + Math.sin(now / 220 + k.cell) * 0.08
        drawPickup(ctx, (x + 0.5) * C, (y + 0.5) * C, C * 1.25 * s, k.kind, colors)
      }

      // trails: crashed ones first, crumbling, then the live ones on top
      const order = [...g.players].sort((a, b) => Number(a.alive) - Number(b.alive))
      for (const p of order) {
        if (!p.path.length) continue
        const before = prev && prev.round === g.round ? prev.players.find((q) => q.id === p.id) : null
        const fresh = before && p.alive ? Math.max(0, Math.min(2, p.path.length - before.path.length)) : 0
        drawTrail(ctx, p, C, colors[p.marker], colors.ink, fresh, t, now)
      }

      // heads
      for (const p of g.players) {
        if (!p.path.length || (!p.alive && g.phase !== 'countdown')) continue
        const before = prev && prev.round === g.round ? prev.players.find((q) => q.id === p.id) : null
        const fresh = before && p.alive ? Math.max(0, Math.min(2, p.path.length - before.path.length)) : 0
        const [hx, hy] = headAt(p, fresh, t)
        drawHead(ctx, p, hx * C, hy * C, C, colors, p.id === meRef.current, g.phase === 'countdown', now)
      }

      // countdown: where everyone is heading, and who is who
      if (g.phase === 'countdown') {
        for (const p of g.players) {
          if (!p.alive) continue
          const [x, y] = xy(p.path[0])
          const dx = [0, 1, 0, -1][p.dir]
          const dy = [-1, 0, 1, 0][p.dir]
          for (let i = 1; i <= 3; i++) {
            const pulse = (Math.sin(now / 160 - i) + 1) / 2
            ctx.globalAlpha = 0.25 + pulse * 0.6
            chevron(ctx, (x + 0.5 + dx * (i + 0.6)) * C, (y + 0.5 + dy * (i + 0.6)) * C, C * 0.42, p.dir, colors.ink)
          }
          ctx.globalAlpha = 1
          label(ctx, p.id === meRef.current ? 'You' : p.name, (x + 0.5) * C, (y + 0.5) * C - C * 1.5, C, colors)
        }
      }

      // effects
      for (const r of f.rings) {
        r.life++
        const k = r.life / r.max
        ctx.strokeStyle = r.color
        ctx.lineWidth = Math.max(1.5, C * 0.25 * (1 - k))
        ctx.beginPath()
        ctx.arc(r.x * C, r.y * C, (r.r + (r.to - r.r) * easeOut(k)) * C, 0, Math.PI * 2)
        ctx.stroke()
      }
      f.rings = f.rings.filter((r) => r.life < r.max)
      for (const s of f.sparks) {
        s.life++
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.95
        s.vy = s.vy * 0.95 + 0.004
        const k = 1 - s.life / s.max
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x * C, s.y * C, Math.max(0.5, s.r * C * k), 0, Math.PI * 2)
        ctx.fill()
      }
      f.sparks = f.sparks.filter((s) => s.life < s.max)

      // the fence
      ctx.strokeStyle = colors.ink
      ctx.lineWidth = 2.5
      roundRect(ctx, -M * 0.6, -M * 0.6, W + M * 1.2, W + M * 1.2, M * 1.6)
      ctx.stroke()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [px])

  // swipes: every 18px of travel in one gesture is a turn, so a quick L-shaped swipe makes two
  const touch = useRef<{ x: number; y: number } | null>(null)
  const handlers = onSwipe
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          touch.current = { x: e.clientX, y: e.clientY }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        },
        onPointerMove: (e: React.PointerEvent) => {
          const s = touch.current
          if (!s) return
          const dx = e.clientX - s.x
          const dy = e.clientY - s.y
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return
          onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0)
          touch.current = { x: e.clientX, y: e.clientY }
        },
        onPointerUp: () => (touch.current = null),
        onPointerCancel: () => (touch.current = null),
      }
    : {}

  return (
    <div ref={wrap} className={`tb-board ${className ?? ''}`} {...handlers} role="img" aria-label={`Arena, ${game.players.filter((p) => p.alive).length} markers still moving`}>
      <canvas ref={canvas} style={{ width: px, height: px }} data-tick={game.tick} />
    </div>
  )
}

/* ---------- drawing ---------- */

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3)
const adjacent = (a: number, b: number) => {
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  return Math.abs(ax - bx) + Math.abs(ay - by) === 1
}

/** Where the head is drawn: partway along the cells added on the latest tick. */
function headAt(p: Player, fresh: number, t: number): [number, number] {
  const n = p.path.length
  const [hx, hy] = xy(p.path[n - 1])
  if (!fresh || n < 2) return [hx + 0.5, hy + 0.5]
  const pos = t * fresh // 0..fresh cells travelled
  const from = n - 1 - fresh
  const i = Math.min(fresh - 1, Math.floor(pos))
  const a = p.path[from + i]
  const b = p.path[from + i + 1]
  if (a === undefined || b === undefined || !adjacent(a, b)) return [hx + 0.5, hy + 0.5]
  const [ax, ay] = xy(a)
  const [bx, by] = xy(b)
  const k = pos - i
  return [ax + (bx - ax) * k + 0.5, ay + (by - ay) * k + 0.5]
}

function drawTrail(ctx: CanvasRenderingContext2D, p: Player, C: number, color: string, ink: string, fresh: number, t: number, now: number) {
  const cells = p.path
  const upto = cells.length - fresh // cells drawn in full
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const pass = (width: number, style: string) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.beginPath()
    let open = false
    for (let i = 0; i < upto; i++) {
      const [x, y] = xy(cells[i])
      const cx = (x + 0.5) * C
      const cy = (y + 0.5) * C
      if (!open || !adjacent(cells[i - 1], cells[i])) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx, cy)
      open = true
    }
    if (fresh && upto > 0) {
      const [hx, hy] = headAt(p, fresh, t)
      ctx.lineTo(hx * C, hy * C)
    }
    ctx.stroke()
  }
  if (!p.alive) {
    // a crashed trail crumbles: thin, dashed, drifting
    ctx.globalAlpha = 0.35
    ctx.setLineDash([C * 0.2, C * 0.5])
    ctx.lineDashOffset = -now / 60
    pass(C * 0.3, color)
    ctx.setLineDash([])
    ctx.globalAlpha = 1
    return
  }
  pass(C * 0.62 + 3, ink)
  pass(C * 0.62, color)
  if (p.ghost > 0) {
    ctx.setLineDash([C * 0.3, C * 0.3])
    pass(C * 0.18, '#fff')
    ctx.setLineDash([])
  }
}

function drawHead(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, C: number, colors: Colors, me: boolean, waiting: boolean, now: number) {
  const r = C * 0.72
  if (p.boost > 0) {
    // fast-forward: speed lines behind the head
    const dx = [0, 1, 0, -1][p.dir]
    const dy = [-1, 0, 1, 0][p.dir]
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    for (let i = -1; i <= 1; i++) {
      const ox = -dy * i * r * 0.6
      const oy = dx * i * r * 0.6
      const len = C * (1.2 + ((now / 80 + i) % 1) * 0.8)
      ctx.beginPath()
      ctx.moveTo(x - dx * r * 1.2 + ox, y - dy * r * 1.2 + oy)
      ctx.lineTo(x - dx * (r * 1.2 + len) + ox, y - dy * (r * 1.2 + len) + oy)
      ctx.stroke()
    }
  }
  if (me) {
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 2
    ctx.setLineDash([3, 3])
    ctx.lineDashOffset = now / 50
    ctx.beginPath()
    ctx.arc(x, y, r + C * (0.45 + Math.sin(now / 200) * 0.12), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.fillStyle = colors[p.marker]
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2.5
  ctx.globalAlpha = p.ghost > 0 ? 0.55 + Math.sin(now / 90) * 0.25 : 1
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.globalAlpha = 1
  // a little arrow on the marker, pointing the way it is going
  chevron(ctx, x, y, r * 0.55, p.dir, colors.ink, waiting ? 2 : 2.5)
}

function chevron(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, d: Dir, color: string, w = 2.5) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((d * Math.PI) / 2)
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(-s * 0.7, s * 0.35)
  ctx.lineTo(0, -s * 0.4)
  ctx.lineTo(s * 0.7, s * 0.35)
  ctx.stroke()
  ctx.restore()
}

function drawPickup(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: Power, colors: Colors) {
  ctx.fillStyle = colors[POWER_BG[kind]]
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 2
  roundRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.28)
  ctx.fill()
  ctx.stroke()
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const u = s * 0.2
  ctx.beginPath()
  if (kind === 'boost') {
    // fast-forward: two chevrons
    ctx.moveTo(x - u * 1.4, y - u)
    ctx.lineTo(x - u * 0.4, y)
    ctx.lineTo(x - u * 1.4, y + u)
    ctx.moveTo(x + u * 0.1, y - u)
    ctx.lineTo(x + u * 1.1, y)
    ctx.lineTo(x + u * 0.1, y + u)
  } else if (kind === 'ghost') {
    // stash: a box with a lid
    ctx.rect(x - u * 1.1, y - u * 0.4, u * 2.2, u * 1.4)
    ctx.moveTo(x - u * 1.3, y - u * 0.8)
    ctx.lineTo(x + u * 1.3, y - u * 0.8)
  } else {
    // revert: an arrow curling back
    ctx.arc(x, y + u * 0.1, u * 1.05, Math.PI * 1.15, Math.PI * 2.6)
    ctx.moveTo(x - u * 1.3, y - u * 1.1)
    ctx.lineTo(x - u * 1.0, y - u * 0.3)
    ctx.lineTo(x - u * 0.2, y - u * 0.6)
  }
  ctx.stroke()
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, C: number, colors: Colors) {
  const size = Math.max(10, C * 0.62)
  ctx.font = `700 ${size}px 'Inter Variable', system-ui, sans-serif`
  const w = ctx.measureText(text).width + size
  const h = size * 1.6
  const left = Math.max(0, Math.min(x - w / 2, SIZE * C - w))
  const top = Math.max(2, y - h / 2)
  ctx.fillStyle = colors.paper
  ctx.strokeStyle = colors.ink
  ctx.lineWidth = 1.5
  roundRect(ctx, left, top, w, h, h / 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = colors.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + w / 2, top + h / 2 + 0.5)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/* ---------- attract mode ---------- */

/** Four bots racing on their own, round after round: the entry screen and the landing page show this. */
export function useDemo(): Game {
  const [g, setG] = useState<Game>(() => {
    let d = newGame('DEMO', 'demo', 0, 999)
    for (let i = 0; i < 4; i++) d = addBot(d, i)
    d = { ...d, players: d.players.map((p, i) => ({ ...p, marker: MARKER_IDS[[0, 1, 2, 3][i]] })) }
    return newRound(d, performance.now() - COUNTDOWN_MS + 600)
  })
  useEffect(() => {
    const id = window.setInterval(() => setG((d) => tick(d, performance.now(), Math.random)), 16)
    return () => window.clearInterval(id)
  }, [])
  return g
}
