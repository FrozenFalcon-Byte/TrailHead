import { motion } from 'motion/react'
import type { CSSProperties, ElementType } from 'react'

type Props = { text: string; as?: ElementType; className?: string; style?: CSSProperties; delay?: number; stagger?: number; once?: boolean; immediate?: boolean }

/** Words rise out of a mask, one after another. */
export function SplitReveal({ text, as: Tag = 'span', className, style, delay = 0, stagger = 0.06, once = true, immediate = false }: Props) {
  const words = text.split(' ')
  const trigger = immediate ? { animate: 'shown' } : { whileInView: 'shown', viewport: { once, amount: 0.5 } }
  return (
    <Tag className={className} style={style} aria-label={text}>
      <motion.span initial="hidden" {...trigger} transition={{ staggerChildren: stagger, delayChildren: delay }} style={{ display: 'inline' }} aria-hidden>
        {words.map((w, i) => (
          <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'bottom', paddingBottom: '0.04em', marginBottom: '-0.04em' }}>
            <motion.span
              style={{ display: 'inline-block', willChange: 'transform' }}
              variants={{ hidden: { y: '105%', rotate: 4 }, shown: { y: '0%', rotate: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] } } }}
            >
              {w}
            </motion.span>
            {i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </motion.span>
    </Tag>
  )
}
