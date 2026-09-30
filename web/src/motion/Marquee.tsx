import { motion } from 'motion/react'
import type { ReactNode } from 'react'

export function Marquee({ children, speed = 28, reverse = false }: { children: ReactNode; speed?: number; reverse?: boolean }) {
  return (
    <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
      <motion.div
        style={{ display: 'inline-flex', gap: 0 }}
        animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
        transition={{ duration: speed, ease: 'linear', repeat: Infinity }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center' }}>{children}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center' }} aria-hidden>{children}</div>
      </motion.div>
    </div>
  )
}
