import { motion } from 'motion/react'

/** A winding trail with numbered stops; the path draws itself and each stop pops as the line reaches it. */
export function TrailPath({ stops, height = 320, color = 'currentColor', progress }: { stops: { label: string; tentative?: boolean }[]; height?: number; color?: string; progress?: number }) {
  const n = Math.max(stops.length, 1)
  const width = 1000
  const points = stops.map((_, i) => {
    const x = 80 + (i * (width - 160)) / Math.max(n - 1, 1)
    const y = height / 2 + Math.sin(i * 1.9 + 0.6) * (height * 0.28)
    return { x, y }
  })
  const d = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x - 60} ${p.y + 40} Q ${p.x - 30} ${p.y + 10} ${p.x} ${p.y}`
    const prev = points[i - 1]
    const mx = (prev.x + p.x) / 2
    return `${acc} C ${mx} ${prev.y}, ${mx} ${p.y}, ${p.x} ${p.y}`
  }, '')
  const drawn = progress ?? 1
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ overflow: 'visible' }} aria-hidden>
      <motion.path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray="2 14" opacity={0.35} />
      <motion.path
        d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: drawn }} transition={{ duration: 1.6, ease: [0.65, 0, 0.35, 1] }}
      />
      {points.map((p, i) => (
        <motion.g
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={drawn >= (i + 0.5) / n ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.25 + (1.4 * i) / n }}
          style={{ originX: `${p.x}px`, originY: `${p.y}px` }}
        >
          <rect x={p.x - 22} y={p.y - 30} width={44} height={60} rx={8} fill={stops[i].tentative ? 'var(--bg)' : 'var(--blaze)'} stroke={stops[i].tentative ? 'var(--blaze)' : 'none'} strokeWidth={3} strokeDasharray={stops[i].tentative ? '6 5' : undefined} transform={`rotate(${i % 2 ? 6 : -6} ${p.x} ${p.y})`} />
          <text x={p.x} y={p.y + 12} textAnchor="middle" fontFamily="Archivo Variable, Arial Black" fontWeight={900} fontSize={30} fill={stops[i].tentative ? 'var(--blaze)' : 'var(--solid)'}>{i + 1}</text>
          <text x={p.x} y={p.y + 62} textAnchor="middle" fontFamily="ui-monospace, Menlo" fontSize={17} fontWeight={700} fill={color}>{stops[i].label}</text>
        </motion.g>
      ))}
    </svg>
  )
}
