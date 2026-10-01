import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Mark } from './Mark'
import { Shape, STORY } from './Shapes'

const WORDS = ['Reading the tree', 'Weighing the branches', 'Asking Jev', 'Tracing the history', 'Marking the trail']
const FLY_MS = 1150
const FLY_EASE = 'cubic-bezier(0.76, 0, 0.24, 1)'

type Phase = 'count' | 'fly'

/** Moves `el` onto the element marked data-morph=`key`, centre on centre, scaled to its width (FLIP). */
function fly(el: HTMLElement | null, key: string, rotate = 0) {
  if (!el) return Promise.resolve()
  const target = document.querySelector<HTMLElement>(`[data-morph="${key}"]`)
  if (!target || !target.offsetWidth) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished
  const a = el.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const s = b.width / a.width
  el.style.transformOrigin = '50% 50%'
  return el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) rotate(${rotate}deg) scale(${s})` }], {
    duration: FLY_MS,
    easing: FLY_EASE,
    fill: 'forwards',
  }).finished
}

/** Loader for every load of the landing page. The five story shapes pop in one by one while the count runs;
    then, instead of lifting away, they fly down and become the hero's conveyor, and the mark docks in the nav. */
export function Loader({ onReveal, onDone }: { onReveal: () => void; onDone: () => void }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => String(Math.round(v)).padStart(3, '0'))
  const [word, setWord] = useState(0)
  const [lit, setLit] = useState(0)
  const [phase, setPhase] = useState<Phase>('count')
  const brand = useRef<HTMLDivElement>(null)
  const shapes = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let cancelled = false
    const ticker = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 380)
    const unsub = count.on('change', (v) => setLit(Math.min(STORY.length, Math.floor(v / 19) + 1)))
    const run = async () => {
      const first = animate(count, 74, { duration: 1.1, ease: [0.33, 1, 0.68, 1] })
      // Fonts usually land well inside the count; never hold the page for them past 1.6s.
      const fonts = Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1600))])
      await Promise.all([first, fonts])
      await animate(count, 100, { duration: 0.45, ease: [0.65, 0, 0.35, 1] })
      if (cancelled) return
      clearInterval(ticker)
      await new Promise((r) => setTimeout(r, 180))
      if (cancelled) return
      setPhase('fly')
      onReveal()
      await Promise.all([
        fly(brand.current, 'brand'),
        ...shapes.current.map((el, i) => fly(el, `shape-${i}`, i % 2 ? 8 : -8)),
      ])
      if (!cancelled) onDone()
    }
    run()
    return () => {
      cancelled = true
      clearInterval(ticker)
      unsub()
    }
  }, [count, onReveal, onDone])

  const flying = phase === 'fly'
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: flying ? 'none' : 'auto' }} aria-label="Loading Trailhead" role="progressbar">
      <motion.div style={{ position: 'absolute', inset: 0, background: 'var(--paper)' }} animate={{ opacity: flying ? 0 : 1 }} transition={{ duration: 0.6, delay: 0.2, ease: 'easeInOut' }} />

      <div style={{ position: 'absolute', top: 16, left: '50%', translate: '-50% 0' }}>
        <div ref={brand} style={{ lineHeight: 0 }}>
          <Mark size={36} />
        </div>
      </div>

      <div style={{ position: 'absolute', left: '50%', top: '46%', translate: '-50% -50%', display: 'flex', gap: 'clamp(8px, 1.4vw, 16px)', alignItems: 'center' }}>
        {STORY.map((s, i) => (
          <motion.div
            key={i}
            ref={(el) => { shapes.current[i] = el }}
            style={{ width: s.kind === 'tag' ? 'clamp(62px, 8.8vw, 106px)' : 'clamp(56px, 8vw, 96px)', lineHeight: 0 }}
            initial={{ scale: 0, rotate: -30 }}
            animate={i < lit ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15 }}
          >
            <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
          </motion.div>
        ))}
      </div>

      <motion.div style={{ position: 'absolute', left: 'var(--gutter)', right: 'var(--gutter)', bottom: 'var(--gutter)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, color: 'var(--ink)' }} animate={flying ? { opacity: 0, y: 30 } : {}} transition={{ duration: 0.4 }}>
        <div>
          <div className="lead" style={{ minHeight: '1.2em' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={WORDS[word]} style={{ display: 'inline-block' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.16 }}>
                {WORDS[word]}…
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="small" style={{ opacity: 0.65, marginTop: 6 }}>Jev decides · the LLM writes · code owns the path</div>
        </div>
        <motion.div className="display" style={{ fontSize: 'clamp(64px, min(12vw, 22svh), 180px)' }}>{rounded}</motion.div>
      </motion.div>
    </div>
  )
}
