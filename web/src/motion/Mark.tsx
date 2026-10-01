import { motion } from 'motion/react'

/** The Trailhead mark: an orange trail-sign tile with a switchback path climbing to a blaze.
    `a` is the tile, `b` the path. */
export function Mark({ size = 34, animate = true, a = 'var(--orange)', b = 'var(--solid)' }: { size?: number; animate?: boolean; a?: string; b?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width={32} height={32} rx={8} fill={a} />
      <motion.path
        d="M8 25 L19 19 L11 13 L22 8"
        fill="none" stroke={b} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"
        initial={animate ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        d="M17.5 6.2 L23.6 7.4 L21.4 13.2"
        fill="none" stroke={b} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"
        initial={animate ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.75, duration: 0.2 }}
      />
    </svg>
  )
}

export function Wordmark({ color = 'currentColor', size = 30 }: { color?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color }}>
      <Mark size={size} />
      <span className="display" style={{ fontSize: size * 0.72, lineHeight: 1, letterSpacing: '-0.04em' }}>
        Trailhead
      </span>
    </span>
  )
}
