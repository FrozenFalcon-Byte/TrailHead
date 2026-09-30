import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef } from 'react'

function Word({ word, progress, range, from, to }: { word: string; progress: MotionValue<number>; range: [number, number]; from: string; to: string }) {
  const color = useTransform(progress, range, [from, to])
  return <motion.span style={{ color }}>{word} </motion.span>
}

/** A paragraph that inks in word by word as it scrolls through the viewport. */
export function ScrubText({ text, className, from = 'var(--mute)', to = 'var(--ink)' }: { text: string; className?: string; from?: string; to?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const words = text.split(' ')
  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => (
        <Word key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} from={from} to={to} />
      ))}
    </p>
  )
}
