import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Mark } from './Mark'

const PANELS = ['var(--lichen)', 'var(--blaze)', 'var(--ice)', 'var(--heather)']
const EASE = [0.76, 0, 0.24, 1] as const

/** Page switch: four blazes of colour rise to cover the old page, then lift off the new one. */
export function Curtain({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, pointerEvents: 'none', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }} aria-hidden>
        {PANELS.map((bg, i) => (
          <motion.div
            key={i}
            style={{ background: bg }}
            initial={{ scaleY: 1, transformOrigin: 'top' }}
            animate={{ scaleY: 0, transformOrigin: 'top', transition: { duration: 0.7, delay: 0.1 + i * 0.06, ease: EASE } }}
            exit={{ scaleY: 1, transformOrigin: 'bottom', transition: { duration: 0.55, delay: i * 0.05, ease: EASE } }}
          />
        ))}
        <motion.div
          style={{ position: 'fixed', left: '50%', top: '50%', x: '-50%', y: '-50%' }}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 0.6, transition: { duration: 0.3 } }}
          exit={{ opacity: 1, scale: 1, transition: { duration: 0.3, delay: 0.35 } }}
        >
          <Mark size={72} animate={false} a="var(--ink)" b="var(--ink)" />
        </motion.div>
      </div>
    </>
  )
}
