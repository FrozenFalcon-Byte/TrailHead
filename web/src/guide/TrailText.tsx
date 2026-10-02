import { animate, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'
import { SplitReveal } from '../motion/SplitReveal'

/* Captions in the guide change the way dashboard pages do. The caption's shape flies in from the active sidebar icon
   (or springs upright when there is none), the title rises word by word with the dashboard's SplitReveal, and the
   card's tint eases to the colour of what it describes. Nothing else moves. */

export type Mark = { kind: ShapeKind; color: string; glyph: Glyph }

export function TrailCaption({ k, kicker, title, body, tone, mark, big, from, className = '' }: {
  k: string | number
  kicker?: React.ReactNode
  title: string
  body?: string
  tone: string
  mark?: Mark
  big?: boolean
  from?: string // selector of the element the shape flies in from
  className?: string
}) {
  const reduce = useReducedMotion()
  const icon = useRef<HTMLSpanElement>(null)
  const first = useRef(true)
  const H = big ? 'h1' : 'h2'

  useLayoutEffect(() => {
    const el = icon.current
    if (first.current) { first.current = false; return }
    if (!el || reduce || document.documentElement.dataset.motion === 'off') return
    const src = from ? document.querySelector(from) : null
    const a = src?.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (a && a.width && b.width) {
      const dx = a.left + a.width / 2 - (b.left + b.width / 2)
      const dy = a.top + a.height / 2 - (b.top + b.height / 2)
      animate(el, { x: [dx, 0], y: [dy, 0], scale: [a.width / b.width, 1], rotate: [-14, 0] }, { type: 'spring', stiffness: 150, damping: 20, mass: 0.9 })
    } else {
      animate(el, { scale: [0.6, 1], rotate: [-14, 0] }, { type: 'spring', stiffness: 260, damping: 16 })
    }
  }, [k, from, reduce])

  return (
    <div className={`tt ${mark ? 'has-mark' : ''} ${className}`} style={{ background: tone }}>
      {mark && (
        <span className="tt-mark" ref={icon} aria-hidden>
          <Shape kind={mark.kind} color={mark.color} glyph={mark.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
        </span>
      )}
      <div className="tt-copy">
        {kicker && <span className="tt-kicker">{kicker}</span>}
        <SplitReveal key={k} as={H} className="tt-title" text={title} immediate delay={0.08} stagger={0.035} />
        {body && <p className="tt-body">{body}</p>}
      </div>
    </div>
  )
}
