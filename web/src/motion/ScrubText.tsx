import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef } from 'react'

function Word({ word, progress, at, span, from, to }: { word: string; progress: MotionValue<number>; at: number; span: number; from: string; to: string }) {
  // Mix the two colours in CSS so theme variables work, and finish each word well before the paragraph leaves.
  const color = useTransform(progress, (v) => {
    const t = Math.min(1, Math.max(0, (v - at) / span))
    return `color-mix(in srgb, ${to} ${(t * 100).toFixed(1)}%, ${from})`
  })
  return <motion.span style={{ color }}>{word} </motion.span>
}

/** A paragraph that inks in word by word as it scrolls through the viewport. The last word is fully inked
    by the time the paragraph's bottom reaches the middle of the screen. */
export function ScrubText({ text, className, from = 'var(--dim)', to = 'var(--ink)' }: { text: string; className?: string; from?: string; to?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.9', 'end 0.55'] })
  const words = text.split(' ')
  const step = 0.92 / words.length
  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <Word key={i} word={w} progress={scrollYProgress} at={i * step} span={step * 2.5} from={from} to={to} />
      ))}
    </p>
  )
}
