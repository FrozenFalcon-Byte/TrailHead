import { motion } from 'motion/react'

/** Topographic contour lines, drawn in. Used behind the loader, the auth screen and the footer. */
export function Contours({ color = 'currentColor', opacity = 0.18, rings = 9, draw = true }: { color?: string; opacity?: number; rings?: number; draw?: boolean }) {
  const paths = Array.from({ length: rings }, (_, i) => {
    const r = 40 + i * 38
    const wobble = (k: number) => (Math.sin(i * 1.7 + k) * 0.12 + 1) * r
    const cx = 560
    const cy = 380
    return `M ${cx - wobble(0)} ${cy} C ${cx - wobble(1)} ${cy - wobble(2) * 0.9}, ${cx + wobble(3) * 0.8} ${cy - wobble(4)}, ${cx + wobble(5)} ${cy - 10}
            S ${cx + wobble(6) * 0.3} ${cy + wobble(7) * 0.9}, ${cx - wobble(0)} ${cy} Z`
  })
  return (
    <svg viewBox="0 0 1120 760" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
      {paths.map((d, i) => (
        <motion.path
          key={i} d={d} fill="none" stroke={color} strokeWidth={1.4} opacity={opacity}
          initial={draw ? { pathLength: 0 } : false}
          animate={{ pathLength: 1, rotate: [0, i % 2 ? 2 : -2, 0] }}
          transition={{ pathLength: { duration: 1.6, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }, rotate: { duration: 18 + i, repeat: Infinity, ease: 'easeInOut' } }}
          style={{ originX: '50%', originY: '50%' }}
        />
      ))}
    </svg>
  )
}
