import { motion } from 'motion/react'

/* Flat trail scenery shared by the landing story: Jev's signal lights, arrow signboards, ridges, clouds and pines.
   Everything is solid colour: paper, stone, ink and signal yellow, with stop red and go green only on signals. */

export type Light = 'stop' | 'wait' | 'go' | 'off'

const LAMP = { stop: 'var(--stop)', wait: 'var(--signal)', go: 'var(--go)' } as const
const DIM = '#3d3b45'

/** A three-lamp signal head: how a Jev decision reads on the trail. Red drops, amber is tentative, green keeps. */
export function Signal({ light, size = 1, pole = 0, label }: { light: Light; size?: number; pole?: number; label?: string }) {
  const w = 34 * size
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }} aria-hidden>
      <div style={{ position: 'relative', width: w, padding: 5 * size, borderRadius: 9 * size, background: 'var(--solid)', boxShadow: `0 0 0 ${2 * size}px var(--paper)`, display: 'grid', gap: 5 * size }}>
        {(['stop', 'wait', 'go'] as const).map((k) => (
          <motion.span
            key={k}
            style={{ display: 'block', width: w - 10 * size, height: w - 10 * size, borderRadius: '50%' }}
            animate={{ backgroundColor: light === k ? LAMP[k] : DIM, scale: light === k ? 1 : 0.86 }}
            transition={{ duration: 0.3 }}
          />
        ))}
        {label && (
          <span className="mono" style={{ position: 'absolute', left: '100%', top: '50%', translate: '10px -50%', whiteSpace: 'nowrap', fontWeight: 700, fontSize: 12 * Math.max(1, size * 0.8), padding: '4px 8px', borderRadius: 6, background: 'var(--solid)', color: 'var(--on-solid)', boxShadow: '0 0 0 2px var(--paper)' }}>{label}</span>
        )}
      </div>
      {pole > 0 && <span style={{ width: 6 * size, height: pole, background: 'var(--solid)' }} />}
    </div>
  )
}

/** An arrow-shaped trail signboard. */
export function SignBoard({ children, dir = 'right', tone = 'signal', size = 1 }: { children: React.ReactNode; dir?: 'left' | 'right'; tone?: 'signal' | 'ink' | 'paper'; size?: number }) {
  const bg = tone === 'signal' ? 'var(--orange)' : tone === 'ink' ? 'var(--solid)' : 'var(--surface)'
  const fg = tone === 'ink' ? 'var(--on-solid)' : tone === 'signal' ? 'var(--solid)' : 'var(--ink)'
  const tip = 22 * size
  const shape = dir === 'right'
    ? `polygon(0 0, calc(100% - ${tip}px) 0, 100% 50%, calc(100% - ${tip}px) 100%, 0 100%)`
    : `polygon(${tip}px 0, 100% 0, 100% 100%, ${tip}px 100%, 0 50%)`
  return (
    <span
      className="display"
      style={{
        display: 'inline-flex', alignItems: 'center', background: bg, color: fg, clipPath: shape,
        fontSize: 24 * size, lineHeight: 1,
        padding: `${12 * size}px ${dir === 'right' ? tip + 14 * size : 18 * size}px ${12 * size}px ${dir === 'left' ? tip + 14 * size : 18 * size}px`,
      }}
    >
      {children}
    </span>
  )
}

/** A full-width mountain ridge silhouette, for section edges and backdrops. */
const RIDGES = [
  'M0 120 L0 70 L90 40 L170 64 L260 18 L340 52 L430 30 L520 66 L610 24 L700 58 L790 36 L880 62 L960 20 L1050 54 L1140 34 L1230 60 L1320 28 L1410 56 L1500 38 L1600 62 L1600 120 Z',
  'M0 120 L0 80 C 120 60, 200 30, 300 44 S 480 86, 600 64 S 820 14, 940 30 S 1160 80, 1280 58 S 1480 26, 1600 48 L1600 120 Z',
  'M0 120 L0 90 L140 60 L220 78 L360 34 L470 70 L560 52 L700 86 L820 40 L930 62 L1060 22 L1180 66 L1300 48 L1420 80 L1520 56 L1600 70 L1600 120 Z',
]
export function Ridge({ fill = 'var(--ink)', variant = 0, height = 120, style }: { fill?: string; variant?: number; height?: number | string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 1600 120" preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block', ...style }} aria-hidden>
      <path d={RIDGES[variant % RIDGES.length]} fill={fill} />
    </svg>
  )
}

/** A flat cloud with an ink outline. Drawn around (0, 0). */
export function Cloud({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 52 a26 26 0 0 1 26 -26 a34 34 0 0 1 64 -10 a28 28 0 0 1 50 14 a22 22 0 0 1 22 22 z" fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" />
    </g>
  )
}

/** A flat pine. Drawn standing on (0, 0). */
export function Pine({ x = 0, y = 0, s = 1, fill = 'var(--solid)' }: { x?: number; y?: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <rect x={-2.5} y={-10} width={5} height={10} />
      <path d="M0 -58 L14 -30 L7 -30 L18 -10 L-18 -10 L-7 -30 L-14 -30 Z" />
    </g>
  )
}
