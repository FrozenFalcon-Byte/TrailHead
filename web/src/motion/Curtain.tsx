import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Mark } from './Mark'
import { useMoment } from '../lib/moment'

const BANDS = ['var(--violet)', 'var(--lime)', 'var(--orange)', 'var(--sky)', 'var(--yellow)']
const EASE = [0.76, 0, 0.24, 1] as const
const TIP = 'polygon(0 0, calc(100% - 10vh) 0, 100% 50%, calc(100% - 10vh) 100%, 0 100%, 10vh 50%)'

/** Page switch: trail-sign bands sweep in from the left to cover the old page, then carry on off to the right. */
export function Curtain({ children }: { children: ReactNode }) {
  // A full-screen moment already hides the switch; sweeping bands underneath it only delay the swap and can
  // show through as it lifts.
  const covered = useMoment() !== null
  if (covered) return <>{children}</>
  return (
    <>
      {children}
      <div style={{ position: 'fixed', inset: 0, zIndex: 90, pointerEvents: 'none', overflow: 'hidden' }} aria-hidden>
        {BANDS.map((bg, i) => (
          <motion.div
            key={i}
            style={{ position: 'absolute', left: '-12vw', width: '130vw', top: `${i * 20 - 0.5}%`, height: '21%', background: bg, clipPath: TIP }}
            initial={{ x: '0%' }}
            animate={{ x: '110%', transition: { duration: 0.75, delay: 0.08 + i * 0.05, ease: EASE } }}
            exit={{ x: ['-110%', '0%'], transition: { duration: 0.6, delay: i * 0.05, ease: EASE } }}
          />
        ))}
        <motion.div
          style={{ position: 'fixed', left: '50%', top: '50%', x: '-50%', y: '-50%' }}
          initial={{ opacity: 1, scale: 1, rotate: 0 }}
          animate={{ opacity: 0, scale: 0.5, rotate: -20, transition: { duration: 0.3 } }}
          exit={{ opacity: 1, scale: 1, rotate: 0, transition: { duration: 0.3, delay: 0.4 } }}
        >
          <Mark size={84} animate={false} />
        </motion.div>
      </div>
    </>
  )
}
