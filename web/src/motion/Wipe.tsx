import { motion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, type ReactNode } from 'react'

/* Section transitions.
   ChevronWipe: a pinned stretch of scroll where trail-sign bands sweep across the screen, cover it,
   and carry on out the other side; the backdrop underneath has changed by the time they leave.
   Rise: the next section comes up as a rounded panel that opens out to full bleed as it docks. */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const BAND_COLORS = ['var(--violet)', 'var(--lime)', 'var(--sky)', 'var(--orange)']

export function ChevronWipe({ from, to, colors = BAND_COLORS, label }: { from: string; to: string; colors?: string[]; label?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const bg = useTransform(p, (v) => (v < 0.5 ? from : to))
  const n = colors.length
  return (
    <div ref={ref} className="l-wipe" aria-hidden>
      <motion.div className="l-wipe__stage" style={{ background: bg }}>
        {colors.map((c, i) => (
          <Band key={i} i={i} n={n} color={c} p={p} label={i === n - 1 ? label : undefined} />
        ))}
      </motion.div>
    </div>
  )
}

function Band({ i, n, color, p, label }: { i: number; n: number; color: string; p: MotionValue<number>; label?: string }) {
  // Bands enter one after another from the left, hold while the screen is covered, then leave to the right.
  const lag = i * 0.05
  const x = useTransform(p, (v) => {
    const enter = smooth(0.04 + lag, 0.4 + lag * 0.5, v)
    const leave = smooth(0.56 + lag * 0.6, 0.96, v)
    return `${(-170 + enter * 155 + leave * 180).toFixed(3)}vw`
  })
  const h = 100 / n
  return (
    <motion.div className="l-wipe__band" style={{ x, top: `${i * h - 0.5}%`, height: `${h + 1}%`, background: color, ['--tip' as string]: `${(h * 0.5).toFixed(2)}vh` }}>
      {label && <span className="display l-wipe__label">{label}</span>}
    </motion.div>
  )
}

export function Rise({ children, className, id, as = 'section', ...rest }: { children: ReactNode; className?: string; id?: string; as?: 'section' | 'div' } & React.AriaAttributes) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start end', 'start start'] })
  const clipPath = useTransform(p, (v) => {
    const t = 1 - smooth(0.05, 0.95, v)
    return `inset(0 ${(t * 4).toFixed(2)}% 0 ${(t * 4).toFixed(2)}% round ${(t * 64).toFixed(1)}px ${(t * 64).toFixed(1)}px 0 0)`
  })
  const Tag = as === 'div' ? motion.div : motion.section
  return (
    <Tag ref={ref as never} id={id} className={`l-rise ${className ?? ''}`} style={{ clipPath }} {...rest}>
      {children}
    </Tag>
  )
}
