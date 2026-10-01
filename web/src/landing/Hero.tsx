import { motion, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Shape, STORY } from '../motion/Shapes'
import { useSignedIn } from '../lib/auth'

const EASE = [0.22, 1, 0.36, 1] as const
const WORDS = ['trailhead.', 'first step.', 'best path.']

/** A line of type that rises out of a mask. */
function Rise({ children, delay, ready }: { children: React.ReactNode; delay: number; ready: boolean }) {
  return (
    <span className="l-hero__line">
      <motion.span style={{ display: 'inline-block' }} initial={{ y: '110%', rotate: 3 }} animate={ready ? { y: '0%', rotate: 0 } : undefined} transition={{ duration: 1, delay, ease: [0.76, 0, 0.24, 1] }}>
        {children}
      </motion.span>
    </span>
  )
}

/** The changing word. Every word sits in the same slot, so the slot is always as wide as the widest one and
    the line never reflows; the letters roll through it instead, the old word out the top, the new one up from below. */
function Swap({ word }: { word: number }) {
  const prev = useRef(word)
  const [last, setLast] = useState(-1)
  useEffect(() => {
    if (prev.current !== word) setLast(prev.current)
    prev.current = word
  }, [word])
  return (
    <span className="l-hero__swap">
      {WORDS.map((w, i) => (
        <span key={w} className="l-hero__word" aria-hidden={i !== word}>
          {[...w].map((ch, k) => {
            const state = i === word ? 'on' : i === last ? 'out' : 'below'
            return (
              <motion.span
                key={k}
                initial={false}
                animate={state === 'on' ? { y: '0%', rotate: 0 } : state === 'out' ? { y: '-115%', rotate: -8 } : { y: '115%', rotate: 8 }}
                transition={state === 'below' ? { duration: 0 } : { duration: 0.55, delay: k * 0.028 + (state === 'on' ? 0.12 : 0), ease: [0.76, 0, 0.24, 1] }}
              >
                {ch === ' ' ? '\u00a0' : ch}
              </motion.span>
            )
          })}
        </span>
      ))}
    </span>
  )
}

export function Hero({ ready, settled }: { ready: boolean; settled: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const signedIn = useSignedIn()
  const [word, setWord] = useState(0)
  // When the loader plays, its shapes land on the conveyor; until then the conveyor's own copies stay hidden.
  const [morph] = useState(() => !settled)
  const handoff = morph && !settled ? { visibility: 'hidden' as const } : undefined

  useEffect(() => {
    if (!settled) return
    const t = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 2600)
    return () => clearInterval(t)
  }, [settled])

  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const lift = useTransform(p, (v) => `${(-v * 18).toFixed(2)}vh`)
  const shrink = useTransform(p, (v) => 1 - v * 0.12)
  const fade = useTransform(p, (v) => 1 - Math.min(1, v * 1.6))
  const sink = useTransform(p, (v) => `${(v * 22).toFixed(2)}vh`)
  const base = 0.1

  return (
    <section ref={ref} id="top" className="l-hero t-cream">
      <motion.div className="l-hero__copy" style={{ y: lift, scale: shrink, opacity: fade }}>
        <motion.div className="l-hero__tags" initial={{ opacity: 0, y: 14 }} animate={ready ? { opacity: 1, y: 0 } : undefined} transition={{ delay: base, duration: 0.6, ease: EASE }}>
          <span className="tag">Mile 0</span>
          <span className="l-hero__chip">Codebase onboarding, decided by Jev</span>
        </motion.div>
        <h1 className="display l-hero__title">
          <Rise ready={ready} delay={base + 0.05}>Every codebase</Rise>
          <span className="l-hero__line">
            <motion.span style={{ display: 'inline-block' }} initial={{ y: '110%', rotate: 3 }} animate={ready ? { y: '0%', rotate: 0 } : undefined} transition={{ duration: 1, delay: base + 0.15, ease: [0.76, 0, 0.24, 1] }}>
              has a{' '}
              <Swap word={word} />
            </motion.span>
          </span>
        </h1>
        <motion.p className="body l-hero__sub" initial={{ opacity: 0, y: 14 }} animate={ready ? { opacity: 1, y: 0 } : undefined} transition={{ delay: base + 0.45, duration: 0.7, ease: EASE }}>
          Point Trailhead at a GitHub repository and say what you want to do. Get a reading path through the code, with every answer cited to the commit, pull request or discussion behind it.
        </motion.p>
        <motion.div className="l-hero__cta" initial={{ opacity: 0, y: 14 }} animate={ready ? { opacity: 1, y: 0 } : undefined} transition={{ delay: base + 0.55, duration: 0.7, ease: EASE }}>
          <Link className="btn lime" to={signedIn ? '/app' : '/signup'}>
            <span>{signedIn ? 'Open your dashboard' : 'Start the trail, free'}</span>
          </Link>
          <a className="btn ghost" href="#story">
            <span>See the story ↓</span>
          </a>
        </motion.div>
      </motion.div>

      <motion.div className="l-conveyor" style={{ y: sink }} aria-hidden>
        <motion.div
          className="l-conveyor__track"
          animate={settled ? { x: ['0%', '-50%'] } : { x: '0%' }}
          transition={settled ? { duration: 34, ease: 'linear', repeat: Infinity } : { duration: 0 }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="l-conveyor__set">
              {[...STORY, ...STORY].map((s, i) => (
                <motion.div
                  key={i}
                  className="l-conveyor__item"
                  data-morph={copy === 0 && i < STORY.length ? `shape-${i}` : undefined}
                  style={{ width: s.kind === 'tag' ? 'calc(var(--s) * 1.1)' : 'var(--s)', ...(copy === 0 && i < STORY.length ? handoff : undefined) }}
                  initial={morph ? false : { scale: 0, rotate: -25 }}
                  animate={ready ? { scale: 1, rotate: 0 } : undefined}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.2 + (i % 5) * 0.07 }}
                  whileHover={{ y: -18, rotate: i % 2 ? 6 : -6, transition: { type: 'spring', stiffness: 300, damping: 14 } }}
                >
                  <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
                </motion.div>
              ))}
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  )
}
