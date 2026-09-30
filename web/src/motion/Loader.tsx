import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useState } from 'react'
import { Contours } from './Contours'
import { Hiker } from './Hiker'
import { Mark } from './Mark'

const WORDS = ['Reading the tree', 'Tracing the history', 'Checking the evidence', 'Marking the trail']

/** First-visit loader. Counts while fonts load, then lifts away in four colour-blocked panels. */
export function Loader({ onDone }: { onDone: () => void }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => String(Math.round(v)).padStart(2, '0'))
  const [word, setWord] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    const ticker = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 420)
    const run = async () => {
      const first = animate(count, 72, { duration: 1.1, ease: [0.33, 1, 0.68, 1] })
      await Promise.all([first, document.fonts?.ready ?? Promise.resolve()])
      await animate(count, 100, { duration: 0.45, ease: [0.65, 0, 0.35, 1] })
      if (cancelled) return
      clearInterval(ticker)
      setWord(WORDS.length - 1)
      setLeaving(true)
      setTimeout(() => !cancelled && onDone(), 950)
    }
    run()
    return () => {
      cancelled = true
      clearInterval(ticker)
    }
  }, [count, onDone])

  const panels = ['var(--pine)', 'var(--bark)', 'var(--glacier)', 'var(--pine-2)']
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: leaving ? 'none' : 'auto' }} aria-label="Loading Trailhead">
      <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {panels.map((bg, i) => (
          <motion.div
            key={i}
            style={{ background: bg, originY: 0 }}
            animate={leaving ? { scaleY: 0 } : { scaleY: 1 }}
            transition={{ duration: 0.8, delay: leaving ? 0.08 * i : 0, ease: [0.76, 0, 0.24, 1] }}
          />
        ))}
      </div>
      <motion.div
        className="t-pine"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'var(--pine)' }}
        animate={leaving ? { opacity: 0, y: -40 } : { opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.76, 0, 0.24, 1] }}
      >
        <Contours color="var(--lichen)" opacity={0.16} rings={11} />
        <div style={{ position: 'absolute', top: 'var(--gutter)', left: 'var(--gutter)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Mark size={30} />
          <span className="display" style={{ fontSize: 24 }}>Trailhead</span>
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)', color: 'var(--lichen)' }}>
          <Hiker size={110} speed={0.8} />
        </div>
        <div style={{ position: 'absolute', left: 'var(--gutter)', right: 'var(--gutter)', bottom: 'var(--gutter)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div className="hand" style={{ fontSize: 26, color: 'var(--blaze)', marginBottom: 6 }}>{WORDS[word]}…</div>
            <div className="small" style={{ opacity: 0.7 }}>Jev decides · the LLM writes · code owns the path</div>
          </div>
          <div className="display" style={{ fontSize: 'clamp(96px, 18vw, 240px)', lineHeight: 0.8 }}>
            <motion.span>{rounded}</motion.span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
