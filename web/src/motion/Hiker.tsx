import { motion } from 'motion/react'

type Props = { size?: number; color?: string; pack?: string; walking?: boolean; speed?: number; stick?: boolean }

const swing = (from: number, to: number, speed: number, delay = 0) => ({
  animate: { rotate: [from, to, from] },
  transition: { duration: speed, repeat: Infinity, ease: 'easeInOut' as const, delay },
})

/** A hiker built from blocks, in the spirit of blazes on a trail. Every limb rotates around its joint. */
export function Hiker({ size = 160, color = 'currentColor', pack = 'var(--blaze)', walking = true, speed = 1.05, stick = true }: Props) {
  const s = walking ? speed : 0
  const limb = (from: number, to: number, delay = 0) => (walking ? swing(from, to, s, delay) : { animate: { rotate: (from + to) / 2 } })
  return (
    <svg viewBox="0 0 120 170" width={size} height={(size * 170) / 120} aria-hidden style={{ overflow: 'visible' }}>
      <motion.g animate={walking ? { y: [0, -3, 0, -3, 0] } : { y: 0 }} transition={{ duration: s, repeat: Infinity, ease: 'easeInOut' }}>
        {/* back arm */}
        <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(28, -24)}>
          <rect x={55} y={40} width={10} height={36} rx={2} fill={color} opacity={0.55} />
        </motion.g>
        {/* back leg */}
        <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(-26, 22)}>
          <rect x={54} y={84} width={12} height={34} rx={2} fill={color} opacity={0.55} />
          <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(0, 34, s * 0.12)}>
            <rect x={54} y={114} width={12} height={32} rx={2} fill={color} opacity={0.55} />
            <rect x={54} y={142} width={22} height={9} rx={2} fill={color} opacity={0.55} />
          </motion.g>
        </motion.g>
        {/* pack + torso + head */}
        <rect x={34} y={36} width={18} height={38} rx={3} fill={pack} transform="rotate(8 43 55)" />
        <rect x={48} y={32} width={26} height={56} rx={3} fill={color} transform="rotate(8 61 60)" />
        <motion.rect x={58} y={8} width={21} height={21} rx={3} fill={color} animate={walking ? { rotate: [4, -3, 4] } : {}} transition={{ duration: s * 2, repeat: Infinity, ease: 'easeInOut' }} />
        {/* front leg */}
        <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(22, -26)}>
          <rect x={56} y={84} width={12} height={34} rx={2} fill={color} />
          <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(34, 0, s * 0.12)}>
            <rect x={56} y={114} width={12} height={32} rx={2} fill={color} />
            <rect x={56} y={142} width={22} height={9} rx={2} fill={color} />
          </motion.g>
        </motion.g>
        {/* front arm with trekking pole */}
        <motion.g style={{ originX: '50%', originY: '0%' }} {...limb(-24, 28)}>
          <rect x={60} y={40} width={10} height={36} rx={2} fill={color} />
          {stick && <rect x={62} y={62} width={4} height={92} rx={2} fill={pack} transform="rotate(-10 64 62)" />}
        </motion.g>
      </motion.g>
    </svg>
  )
}
