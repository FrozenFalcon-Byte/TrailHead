import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Shape } from '../motion/Shapes'

/* How captions change in the guide. Nothing flips: the old words tumble downhill one by one, the card reshapes and
   takes on the colour of the part of the scene it describes, a trail draws itself under the new title with the flag
   walking along it, and the new words climb up into place behind the flag. The stop number rolls like an odometer. */

const TRAIL = 'M2 10 C 30 2, 50 18, 80 10 S 130 2, 160 10 S 210 18, 238 8'

function seeded(i: number) {
  const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453
  return x - Math.floor(x)
}

const word = {
  hidden: (i: number) => ({ y: 34 + seeded(i) * 16, x: -22, rotate: -18 + seeded(i + 3) * 10, scale: 0.5 }),
  shown: (i: number) => ({ y: 0, x: 0, rotate: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 340, damping: 19, delay: 0.16 + Math.min(i, 30) * 0.028 } }),
  gone: (i: number) => ({
    y: [0, -10, 70 + seeded(i) * 40],
    x: [0, 6, 30 + seeded(i + 1) * 50],
    rotate: [0, -6, 50 + seeded(i + 2) * 70],
    opacity: [1, 1, 0],
    transition: { duration: 0.5, times: [0, 0.25, 1], ease: 'easeIn' as const, delay: i * 0.012 },
  }),
}

function Words({ text, from = 0 }: { text: string; from?: number }) {
  return (
    <>
      {text.split(' ').map((w, i) => (
        <motion.span key={i} className="tt-word" custom={from + i} variants={word}>
          {w}
          {' '}
        </motion.span>
      ))}
    </>
  )
}

/** Digits that roll up to the new value, each one on its own wheel. */
export function Odometer({ value }: { value: string }) {
  return (
    <span className="tt-odo" aria-label={value}>
      {value.split('').map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="tt-odo__wheel" aria-hidden>
            <motion.span className="tt-odo__strip" animate={{ y: `${-Number(ch)}em` }} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: i * 0.06 }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </motion.span>
          </span>
        ) : (
          <span key={i} aria-hidden>{ch}</span>
        ),
      )}
    </span>
  )
}

export function TrailCaption({ k, kicker, title, body, tone, big, className = '' }: { k: string | number; kicker?: React.ReactNode; title: string; body?: string; tone: string; big?: boolean; className?: string }) {
  const reduce = useReducedMotion()
  const H = big ? 'h1' : 'h2'
  const titleCount = title.split(' ').length
  return (
    <motion.div layout={!reduce} className={`tt ${className}`} style={{ background: tone }} transition={{ layout: { type: 'spring', stiffness: 260, damping: 28 } }}>
      {kicker && <span className="tt-kicker">{kicker}</span>}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={k} className="tt-block" initial={reduce ? false : 'hidden'} animate="shown" exit={reduce ? undefined : 'gone'}>
          <H className="tt-title"><Words text={title} /></H>
          <div className="tt-trail" aria-hidden>
            <svg viewBox="0 0 240 20" preserveAspectRatio="none">
              <motion.path d={TRAIL} className="tt-trail__line" variants={{ hidden: { pathLength: 0 }, shown: { pathLength: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } }, gone: { pathLength: 0, transition: { duration: 0.25 } } }} />
            </svg>
            <motion.span className="tt-trail__flag" style={{ offsetPath: `path('${TRAIL}')` }}
              variants={{ hidden: { offsetDistance: '0%', scale: 0 }, shown: { offsetDistance: '100%', scale: 1, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } }, gone: { scale: 0, transition: { duration: 0.15 } } }}>
              <Shape kind="tag" color="var(--orange)" glyph="flag" size={18} play={false} />
            </motion.span>
          </div>
          {body && <p className="tt-body"><Words text={body} from={titleCount} /></p>}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
