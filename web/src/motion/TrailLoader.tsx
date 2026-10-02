import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'

/* The loading scene used across the dashboard: a marker walks a dotted trail through the hills, inking the path
   behind it, and plants a flag at the far end before starting over. The caption rolls through what is happening. */

const TRAIL = 'M14 92 C 54 92, 66 62, 104 64 S 160 96, 200 84 S 262 44, 306 50'
const LOOP = 3.2

export function TrailLoader({ label = 'Walking over', hints = [], compact = false }: { label?: string; hints?: string[]; compact?: boolean }) {
  const reduce = useReducedMotion()
  const lines = [label, ...hints]
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (lines.length < 2) return
    const id = window.setInterval(() => setAt((n) => (n + 1) % lines.length), 2400)
    return () => window.clearInterval(id)
  }, [lines.length])
  return (
    <div className={`tl ${compact ? 'is-compact' : ''}`} role="status" aria-live="polite" aria-label={label}>
      <svg viewBox="0 0 320 112" className="tl-svg" aria-hidden>
        <path d="M150 100 L196 34 L242 100 Z" className="tm-peak" />
        <path d="M196 34 L242 100 L204 100 Z" className="tm-peak__shade" />
        <path d="M186 48 L196 34 L206 48 L199 44 L193 50 Z" className="tm-peak__snow" />
        <path d="M150 100 L196 34 L242 100" className="tm-peak__line" />
        <path d="M0 98 C 60 86, 120 104, 180 94 S 280 86, 320 96 V112 H0 Z" className="tl-hill" />
        {[[40, 84, 0.8, true], [64, 80, 0.62, false], [140, 98, 0.75, true], [262, 90, 0.85, true], [284, 94, 0.6, false]].map(([x, y, s, pine], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
            <g className="tm-tree" style={{ animationDelay: `${i * -0.6}s` }}>
              <path d="M0 1 V-6" className="tm-tree__trunk" />
              {pine ? <path d="M0 -26 L7 -15 H4 L9 -6 H-9 L-4 -15 H-7 Z" className="tm-tree__pine" /> : <circle cy={-13} r={8.5} className="tm-tree__round" />}
            </g>
          </g>
        ))}
        <path d={TRAIL} className="tl-ghost" />
        <path d={TRAIL} pathLength={1} className="tl-ink" style={{ animationDuration: `${LOOP}s` }} />
        <g transform="translate(306 50)">
          <path d="M0 0 V-24" className="tm-flag__pole" />
          <path d="M0 -24 L16 -19 L0 -14 Z" className="tl-flag" style={{ animationDuration: `${LOOP}s` }} />
        </g>
        <g className="tl-walker">
          {!reduce && <animateMotion dur={`${LOOP}s`} repeatCount="indefinite" path={TRAIL} keyPoints="0;1;1" keyTimes="0;0.86;1" calcMode="linear" />}
          <circle r={9} className="tl-walker__ring" />
          <g className="tl-walker__bob">
            <circle r={5.5} className="tl-walker__dot" />
          </g>
        </g>
      </svg>
      <span className="tl-caption">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={at} initial={{ y: 14, rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -14, rotateX: 70 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
            {lines[at]}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
