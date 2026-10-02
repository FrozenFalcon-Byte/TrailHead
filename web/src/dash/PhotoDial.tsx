import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useAvatar } from '../lib/profile'

/* The profile photo as a compass. A bezel of ticks surrounds the photo and turns to face the pointer, the photo
   leans toward it, and "Change" is stamped on when you hover. A new photo opens through an iris while the bezel
   swings a full turn, so changing it feels like something happened. */

const TICKS = 48

export function PhotoDial({ size = 132, onEdit }: { size?: number; onEdit: () => void }) {
  const src = useAvatar()
  const { displayName } = useAuth()
  const reduce = useReducedMotion()
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState(false)
  const turn = useMotionValue(0)
  const bezel = useSpring(turn, { stiffness: 120, damping: 16 })
  const tx = useSpring(0, { stiffness: 220, damping: 18 })
  const ty = useSpring(0, { stiffness: 220, damping: 18 })
  const rotateX = useTransform(ty, (v) => -v * 14)
  const rotateY = useTransform(tx, (v) => v * 14)
  const outer = size + 34

  const onMove = (e: React.PointerEvent) => {
    if (reduce) return
    const r = ref.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    tx.set(x)
    ty.set(y)
    // turn the bezel the short way round toward the pointer
    const target = (Math.atan2(y, x) * 180) / Math.PI + 90
    const now = turn.get()
    turn.set(now + ((((target - now) % 360) + 540) % 360) - 180)
  }
  const onLeave = () => {
    setHover(false)
    tx.set(0)
    ty.set(0)
  }

  // a new photo: swing the bezel a whole turn
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!reduce) animate(turn, turn.get() + 360, { duration: 0.9, ease: [0.76, 0, 0.24, 1] })
  }, [src])

  return (
    <motion.button
      ref={ref}
      type="button"
      className="pdl"
      style={{ width: outer, height: outer, perspective: 600 }}
      onClick={onEdit}
      onPointerMove={onMove}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={onLeave}
      onFocus={() => setHover(true)}
      onBlur={onLeave}
      whileTap={{ scale: 0.96 }}
      aria-label="Change profile photo"
      data-cursor="Change photo"
    >
      <motion.svg viewBox="-50 -50 100 100" className="pdl-bezel" style={{ rotate: bezel }} aria-hidden>
        <circle r={48} className="pdl-bezel__rim" />
        {Array.from({ length: TICKS }, (_, i) => (
          <line key={i} y1={-46} y2={i % 12 === 0 ? -40 : i % 4 === 0 ? -42.5 : -44} className={i % 12 === 0 ? 'is-major' : ''} transform={`rotate(${(i * 360) / TICKS})`} />
        ))}
        <path d="M0 -49 L4 -41 L-4 -41 Z" className="pdl-bezel__north" />
      </motion.svg>
      <motion.span className="pdl-face" style={{ width: size, height: size, rotateX, rotateY }}>
        <motion.span
          key={src || 'none'}
          className="pdl-iris"
          initial={first.current ? false : { clipPath: 'circle(0% at 50% 50%)', scale: 1.15 }}
          animate={{ clipPath: 'circle(50% at 50% 50%)', scale: 1 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {src ? <img src={src} alt="" width={size} height={size} referrerPolicy="no-referrer" draggable={false} /> : <svg viewBox="0 0 100 100" className="pdl-blank" aria-label={displayName || 'No photo yet'}><path d="M8 82 L40 34 L56 56 L66 44 L92 82 Z" className="pdl-blank__peak" /><path d="M33 45 L40 34 L47 45 L42 42 L38 47 Z" className="pdl-blank__snow" /><circle cx={72} cy={26} r={8} className="pdl-blank__sun" /></svg>}
        </motion.span>
      </motion.span>
      <motion.span className="pdl-stamp" initial={false} animate={hover ? { scale: 1, rotate: -8, y: 0 } : { scale: 0, rotate: 20, y: 10 }} transition={{ type: 'spring', stiffness: 520, damping: hover ? 14 : 30 }}>
        {src ? 'Change' : 'Add photo'}
      </motion.span>
    </motion.button>
  )
}
