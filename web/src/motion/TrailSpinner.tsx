import { motion } from 'motion/react'

/** In-house loader: three blazes stepping along a dotted trail. */
export function TrailSpinner({ label, size = 1 }: { label?: string; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }} role="status" aria-live="polite">
      <svg width={64 * size} height={22 * size} viewBox="0 0 64 22" aria-hidden>
        <line x1={2} y1={19} x2={62} y2={19} stroke="currentColor" strokeWidth={2} strokeDasharray="1 5" strokeLinecap="round" opacity={0.5} />
        {[0, 1, 2].map((i) => (
          <motion.rect
            key={i}
            x={8 + i * 20} y={3} width={8} height={13} rx={1.5}
            fill={i === 1 ? 'var(--blaze)' : 'currentColor'}
            style={{ originX: 0.5, originY: 1 }}
            animate={{ scaleY: [0.25, 1, 0.25], y: [4, 0, 4], rotate: [0, i % 2 ? 6 : -6, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
          />
        ))}
      </svg>
      {label && <span className="small">{label}</span>}
    </span>
  )
}
