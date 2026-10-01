import { motion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Contours } from '../motion/Contours'
import { Hiker } from '../motion/Hiker'
import { useSignedIn } from '../lib/auth'

const EASE = [0.22, 1, 0.36, 1] as const

function Rise({ children, delay, className, style }: { children: React.ReactNode; delay: number; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={className} style={{ display: 'inline-block', overflow: 'hidden', paddingTop: '0.04em', paddingBottom: '0.04em', ...style }}>
      <motion.span style={{ display: 'inline-block' }} initial={{ y: '108%' }} animate={{ y: '0%' }} transition={{ duration: 1.1, delay, ease: EASE }}>
        {children}
      </motion.span>
    </span>
  )
}

function MiniTree() {
  return (
    <svg width={40} height={30} viewBox="0 0 40 30" aria-hidden>
      <motion.path d="M20 4 L20 12 M20 12 L8 22 M20 12 L20 24 M20 12 L32 22" stroke="currentColor" strokeWidth={3} strokeLinecap="round" fill="none"
        initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.4, 0.8, 1] }} />
      <motion.rect x={16} y={22} width={8} height={7} rx={1.5} fill="var(--blaze)" animate={{ scale: [0, 0, 1, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity, times: [0, 0.35, 0.45, 0.8, 1] }} style={{ originX: '20px', originY: '25px' }} />
    </svg>
  )
}

export function Hero({ ready }: { ready: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const signedIn = useSignedIn()
  const [mode, setMode] = useState<'walk' | 'search'>('walk')
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '28%'])
  const fade = useTransform(scrollYProgress, [0, 0.7], [1, 0])
  const base = ready ? 0.15 : 99 // hold the entrance until the loader has lifted

  return (
    <section ref={ref} id="top" className="l-hero t-pine">
      <Contours color="var(--lichen)" opacity={0.1} rings={10} />
      <motion.span className="hand l-hero__note" initial={{ opacity: 0, scale: 0.8 }} animate={ready ? { opacity: 1, scale: 1 } : {}} transition={{ delay: 1.4, duration: 0.6 }}>
        given a repo + a goal ↘
      </motion.span>
      <motion.div style={{ y, opacity: fade, position: 'relative' }}>
        <motion.div className="l-hero__pills" initial={{ opacity: 0, y: 20 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ delay: base, duration: 0.7, ease: EASE }}>
          <button className="l-hero__pill" aria-pressed={mode === 'walk'} onClick={() => setMode('walk')} aria-label="The guided tour">
            <Hiker size={26} speed={0.7} walking={mode === 'walk'} stick={false} color="currentColor" pack="var(--blaze)" />
          </button>
          <button className="l-hero__pill" aria-pressed={mode === 'search'} onClick={() => setMode('search')} aria-label="The beam search">
            <MiniTree />
          </button>
        </motion.div>
        <h1 className="display l-headline">
          <span className="l-headline__row">
            <Rise className="l-headline__small" delay={base + 0.25}>Every</Rise>
            <Rise delay={base + 0.1}>Codebase</Rise>
            <Rise className="l-headline__small" delay={base + 0.3}>has a</Rise>
          </span>
          <span className="l-headline__row">
            <Rise delay={base + 0.2}><span className="oblique">{mode === 'walk' ? 'Trail' : 'Beam'}</span></Rise>
            <Rise delay={base + 0.28}>{mode === 'walk' ? 'head' : 'path'}</Rise>
          </span>
        </h1>
        <motion.p className="body l-hero__sub" initial={{ opacity: 0, y: 16 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ delay: base + 0.7, duration: 0.8, ease: EASE }}>
          {mode === 'walk'
            ? 'Point Trailhead at a GitHub repository, say what you want to do, and get a reading path through the code — every stop explained, every answer cited to the commit, pull request or discussion it came from.'
            : 'Under the hood, Jev walks the directory tree one decision at a time, keeps the three most likely branches, and prunes the rest. No embeddings, no guessing: every step is a logged, cached probability.'}
        </motion.p>
        <motion.div className="l-hero__cta" initial={{ opacity: 0, y: 16 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ delay: base + 0.85, duration: 0.8, ease: EASE }}>
          <Link className="btn" to={signedIn ? '/app' : '/signup'}>
            <span>{signedIn ? 'Open your dashboard' : 'Start the trail — free'}</span>
            <span className="arrow">→</span>
          </Link>
          <a className="btn ghost" href="#how">
            <span>See how it decides</span>
          </a>
        </motion.div>
      </motion.div>
      <div className="l-hero__walk">
        <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 20" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <line x1={0} y1={19} x2={100} y2={19} stroke="var(--lichen)" strokeWidth={0.4} strokeDasharray="0.6 1.6" opacity={0.6} />
        </svg>
        <motion.div style={{ position: 'absolute', bottom: 2, color: 'var(--lichen)' }} initial={{ left: '-10%' }} animate={{ left: '105%' }} transition={{ duration: 26, repeat: Infinity, ease: 'linear', delay: 1 }}>
          <Hiker size={66} speed={0.95} />
        </motion.div>
        {[18, 46, 77].map((x, i) => (
          <motion.div key={x} style={{ position: 'absolute', left: `${x}%`, bottom: 4, width: 14, height: 30, borderRadius: 3, background: i === 1 ? 'var(--blaze)' : 'var(--lichen)', originY: 1, rotate: i % 2 ? 6 : -6 }}
            initial={{ scaleY: 0 }} animate={ready ? { scaleY: 1 } : {}} transition={{ delay: base + 1 + i * 0.15, type: 'spring', stiffness: 300, damping: 14 }} />
        ))}
      </div>
    </section>
  )
}
