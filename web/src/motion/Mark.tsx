import { motion } from 'motion/react'

/** The Trailhead mark: two trail blazes, the painted rectangles that mark a path on a tree. */
export function Mark({ size = 34, animate = true, a = 'var(--lichen)', b = 'var(--blaze)' }: { size?: number; animate?: boolean; a?: string; b?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <motion.rect
        x={8} y={4} width={7} height={13} rx={1.5} fill={a}
        style={{ originX: 0.5, originY: 1 }}
        initial={animate ? { scaleY: 0, rotate: -8 } : false}
        animate={{ scaleY: 1, rotate: -8 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.rect
        x={17} y={15} width={7} height={13} rx={1.5} fill={b}
        style={{ originX: 0.5, originY: 0 }}
        initial={animate ? { scaleY: 0, rotate: 8 } : false}
        animate={{ scaleY: 1, rotate: 8 }}
        transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  )
}

export function Wordmark({ color = 'currentColor' }: { color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color }}>
      <Mark size={30} />
      <span className="display" style={{ fontSize: 26, lineHeight: 1, letterSpacing: '0.01em' }}>
        Trail<span className="oblique">head</span>
      </span>
    </span>
  )
}
