import { motion, useMotionValue, useSpring, useTransform, useVelocity } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/* The Trailhead cursor. One object, no follower: a solid teardrop whose sharp corner is the hotspot.
   - Over links the teardrop stretches into an orange label pill ("Open →", "Visit ↗", or data-cursor).
   - Over buttons, nav links and chips it leaves the pointer and wraps the control as a ring, which leans
     toward you, magnet-style.
   - Over text fields it narrows into a violet I-beam.
   - Pressing squishes it; releasing sends a ripple and a burst of story shapes, and shifts the ring colour.
   - Cards with [data-tilt] tilt in 3D under it.
   Fine pointers only; off under reduced motion. */

type Mode = 'idle' | 'link' | 'text' | 'stick'
type Ring = { x: number; y: number; w: number; h: number; r: number }

const STICK = '.btn, [data-magnet], .l-nav__links a, .l-nav__cta, .l-nav__login, .theme-switch, .l-chat__q, .d-chip'
const LINK = 'a, button, [role="button"], summary, label, select, [data-cursor]'
const TEXT = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]'
const COLORS = ['var(--orange)', 'var(--violet)', 'var(--green)', 'var(--blue)', 'var(--yellow)']
const KINDS = ['50%', '6px', '50% 50% 50% 6px'] as const
const SPRING = { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 } as const

let ctx: CanvasRenderingContext2D | null = null
function textWidth(s: string) {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 8
  ctx.font = '800 13px "Archivo Variable", system-ui, sans-serif'
  return Math.ceil(ctx.measureText(s).width)
}

export function TrailCursor() {
  const [on, setOn] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [label, setLabel] = useState('')
  const [down, setDown] = useState(false)
  const [away, setAway] = useState(true)
  const [tint, setTint] = useState(0)
  const [ring, setRing] = useState<Ring | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const tintRef = useRef(0)

  const px = useMotionValue(-100)
  const py = useMotionValue(-100)
  // The body sits exactly on the pointer, except when it travels to wrap a control (and back).
  const bx = useSpring(-100, { stiffness: 420, damping: 34, mass: 0.6 })
  const by = useSpring(-100, { stiffness: 420, damping: 34, mass: 0.6 })
  // A touch of stretch with speed.
  const speed = useTransform([useVelocity(px), useVelocity(py)], ([vx, vy]: number[]) => Math.min(0.22, Math.hypot(vx, vy) / 9000))
  const stretch = useSpring(useTransform(speed, (s) => 1 + s), { stiffness: 400, damping: 30 })

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setOn(true)
    document.documentElement.classList.add('tc-on')

    let stuck: HTMLElement | null = null
    let tilt: HTMLElement | null = null
    let chaseUntil = 0
    const ease = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)'

    const follow = (x: number, y: number) => {
      if (performance.now() < chaseUntil) {
        bx.set(x)
        by.set(y)
      } else {
        bx.jump(x)
        by.jump(y)
      }
    }
    const unstick = () => {
      if (!stuck) return
      stuck.style.transition = ease
      stuck.style.transform = ''
      stuck = null
      chaseUntil = performance.now() + 320
      setRing(null)
    }
    const untilt = () => {
      if (!tilt) return
      tilt.style.transition = ease
      tilt.style.transform = ''
      tilt = null
    }

    const release = (x: number, y: number) => {
      const host = layer.current
      if (!host) return
      const color = COLORS[tintRef.current % COLORS.length]
      const ripple = document.createElement('span')
      ripple.className = 'tc-ripple'
      ripple.style.left = `${x}px`
      ripple.style.top = `${y}px`
      ripple.style.boxShadow = `inset 0 0 0 2.5px ${color}`
      host.appendChild(ripple)
      ripple.animate([{ transform: 'scale(0.2)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }).onfinish = () => ripple.remove()
      for (let i = 0; i < 6; i++) {
        const el = document.createElement('span')
        el.className = 'tc-burst'
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        el.style.background = COLORS[(i + tintRef.current) % COLORS.length]
        el.style.borderRadius = KINDS[i % KINDS.length]
        host.appendChild(el)
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.6
        const d = 30 + Math.random() * 22
        el.animate(
          [
            { transform: 'translate(0, 0) scale(0.3) rotate(0deg)', opacity: 1 },
            { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(1) rotate(${a * 90}deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${Math.cos(a) * d * 1.3}px, ${Math.sin(a) * d * 1.3 + 12}px) scale(0) rotate(${a * 140}deg)`, opacity: 0 },
          ],
          { duration: 640, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        ).onfinish = () => el.remove()
      }
    }

    const move = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e
      px.set(x)
      py.set(y)
      setAway(false)

      const target = e.target as HTMLElement | null
      const text = target?.closest(TEXT)
      const link = !text ? target?.closest<HTMLElement>(LINK) : null
      const stick = link?.closest<HTMLElement>(STICK) ?? null
      const r = stick?.getBoundingClientRect()

      if (stick && r && r.width < 380 && r.height < 100) {
        if (stuck !== stick) {
          unstick()
          stuck = stick
        }
        const ox = (x - (r.left + r.width / 2)) * 0.16
        const oy = (y - (r.top + r.height / 2)) * 0.24
        stick.style.transition = 'transform 0.18s ease-out'
        stick.style.transform = `translate(${ox}px, ${oy}px)`
        const pad = 6
        const radius = parseFloat(getComputedStyle(stick).borderRadius) || 12
        const h = r.height + pad * 2
        bx.set(r.left - pad + ox)
        by.set(r.top - pad + oy)
        setRing({ x: r.left, y: r.top, w: r.width + pad * 2, h, r: Math.min(radius + pad, h / 2) })
        setMode('stick')
      } else {
        unstick()
        follow(x, y)
        setMode(text ? 'text' : link ? 'link' : 'idle')
      }
      const named = link?.closest<HTMLElement>('[data-cursor]')?.dataset.cursor
      setLabel(named ?? (link ? (link.tagName === 'A' && (link as HTMLAnchorElement).target === '_blank' ? 'Visit ↗' : link.tagName === 'A' ? 'Open →' : 'Click') : ''))

      const t = target?.closest<HTMLElement>('[data-tilt]') ?? null
      if (t !== tilt) {
        untilt()
        tilt = t
      }
      if (tilt) {
        const b = tilt.getBoundingClientRect()
        const qx = (x - b.left) / b.width - 0.5
        const qy = (y - b.top) / b.height - 0.5
        const amt = Number(tilt.dataset.tilt || 8)
        tilt.style.transition = 'transform 0.12s ease-out'
        tilt.style.transform = `perspective(900px) rotateX(${(-qy * amt).toFixed(2)}deg) rotateY(${(qx * amt).toFixed(2)}deg) translateY(-4px)`
      }
    }
    const press = () => setDown(true)
    const up = (e: PointerEvent) => {
      setDown(false)
      tintRef.current += 1
      setTint(tintRef.current)
      release(e.clientX, e.clientY)
    }
    const leave = () => {
      setAway(true)
      unstick()
      untilt()
    }
    // Content moves under a still pointer while scrolling: re-read what is beneath it once per frame.
    let pending = 0
    const scroll = () => {
      if (pending) return
      pending = requestAnimationFrame(() => {
        pending = 0
        const x = px.get()
        const y = py.get()
        if (x < 0) return
        unstick()
        move({ clientX: x, clientY: y, target: document.elementFromPoint(x, y) } as unknown as PointerEvent)
      })
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', up)
    window.addEventListener('scroll', scroll, { passive: true })
    document.documentElement.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(pending)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('scroll', scroll)
      document.documentElement.removeEventListener('pointerleave', leave)
      document.documentElement.classList.remove('tc-on')
      unstick()
      untilt()
    }
  }, [px, py, bx, by])

  if (!on) return null
  const color = COLORS[tint % COLORS.length]
  const showLabel = mode === 'link' && !!label

  const shape =
    mode === 'stick' && ring
      ? { width: ring.w, height: ring.h, borderRadius: `${ring.r}px ${ring.r}px ${ring.r}px ${ring.r}px`, marginLeft: 0, marginTop: 0 }
      : mode === 'text'
        ? { width: 3, height: 26, borderRadius: '2px 2px 2px 2px', marginLeft: -1.5, marginTop: -13 }
        : showLabel
          ? { width: textWidth(label) + 28, height: 30, borderRadius: '3px 15px 15px 15px', marginLeft: 0, marginTop: 0 }
          : { width: 20, height: 20, borderRadius: '3px 10px 10px 10px', marginLeft: 0, marginTop: 0 }

  const paint =
    mode === 'stick'
      ? { background: `color-mix(in srgb, ${color} 14%, transparent)`, boxShadow: `inset 0 0 0 2.5px ${color}` }
      : mode === 'text'
        ? { background: 'var(--violet)', boxShadow: '0 0 0 0 transparent' }
        : showLabel
          ? { background: 'var(--orange)', boxShadow: '0 0 0 2px var(--solid)' }
          : { background: 'var(--solid)', boxShadow: '0 0 0 2px var(--on-solid)' }

  return (
    <div ref={layer} className="tc-layer" style={{ opacity: away ? 0 : 1, transition: 'opacity 0.25s' }} aria-hidden>
      <motion.div className="tc-pos" style={{ x: bx, y: by }}>
        <motion.div style={{ scale: mode === 'idle' ? stretch : 1, originX: 0, originY: 0 }}>
          <motion.div
            className="tc-body"
            initial={false}
            animate={{ ...shape, scale: down ? (mode === 'stick' ? 0.94 : 0.78) : 1, rotate: down && mode === 'idle' ? -12 : 0 }}
            transition={SPRING}
            style={{ ...paint, transition: 'background-color 0.25s, box-shadow 0.25s' }}
          >
            <motion.span className="tc-text" initial={false} animate={{ opacity: showLabel ? 1 : 0, x: showLabel ? 0 : -8 }} transition={{ duration: 0.18, delay: showLabel ? 0.06 : 0 }}>
              {label}
            </motion.span>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  )
}
