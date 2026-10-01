import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'

/* Nav jumps. Instead of smooth-scrolling through every scene on the way, columns of the destination's
   colours drop in like a stack of trail signs, a sign names where you are headed, the page teleports
   underneath while it is covered, and the columns lift away to reveal the new spot. */

export type Hop = { id: string; label: string; n: number }

const EASE = [0.76, 0, 0.24, 1] as const
const COLS = 6
const LOOK: Record<string, { bg: string; accent: string; kicker: string }> = {
  top: { bg: 'var(--paper)', accent: 'var(--orange)', kicker: 'Back to' },
  story: { bg: 'var(--lilac)', accent: 'var(--violet)', kicker: 'Detour to' },
  how: { bg: 'var(--butter)', accent: 'var(--green)', kicker: 'Detour to' },
  receipts: { bg: 'var(--sky)', accent: 'var(--blue)', kicker: 'Detour to' },
  faq: { bg: 'var(--peach)', accent: 'var(--violet)', kicker: 'Detour to' },
}

export function JumpCover({ hop, onCovered, onDone }: { hop: Hop | null; onCovered: (id: string) => void; onDone: () => void }) {
  useEffect(() => {
    if (!hop) return
    // Columns finish covering at ~0.9s + stagger; teleport then, hold so the sign reads, then lift.
    const t1 = window.setTimeout(() => onCovered(hop.id), 1250)
    const t2 = window.setTimeout(onDone, 2100)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [hop, onCovered, onDone])

  const look = hop ? (LOOK[hop.id] ?? LOOK.top) : LOOK.top
  return (
    <AnimatePresence>
      {hop && (
        <motion.div key={hop.n} className="l-hop" aria-hidden initial="in" animate="cover" exit="out">
          {Array.from({ length: COLS }, (_, i) => (
            <motion.div
              key={i}
              className="l-hop__col"
              style={{ left: `${(i * 100) / COLS}%`, background: i % 2 ? look.bg : `color-mix(in srgb, ${look.bg} 70%, ${look.accent})` }}
              variants={{
                in: { y: '-102%' },
                cover: { y: '0%', transition: { duration: 0.9, delay: i * 0.06, ease: EASE } },
                out: { y: '102%', transition: { duration: 0.85, delay: 0.15 + (COLS - 1 - i) * 0.06, ease: EASE } },
              }}
            />
          ))}
          <motion.div
            className="l-hop__sign"
            style={{ ['--hop' as string]: look.accent }}
            variants={{
              in: { opacity: 0, y: -40, rotate: -8, scale: 0.8 },
              cover: { opacity: 1, y: 0, rotate: -3, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 20, delay: 0.55 } },
              out: { opacity: 0, y: 80, rotate: 6, transition: { duration: 0.5, ease: EASE } },
            }}
          >
            <span className="l-hop__kicker">{look.kicker}</span>
            <span className="l-hop__label">{hop.label}</span>
            <motion.span
              className="l-hop__arrow"
              variants={{ in: { x: -16 }, cover: { x: [0, 10, 0], transition: { duration: 0.7, delay: 0.7, repeat: 1 } }, out: { x: 40 } }}
            >
              →
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
