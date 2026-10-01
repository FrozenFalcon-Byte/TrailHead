import { motion, useInView, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Signal, type Light } from '../motion/Scenery'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'
import { TOUR_DEMO } from './demo'

/* Mile 2, the junction. A pinned section: on the left a signpost with one arrow board per thing Trailhead
   hands you; on the right a deck of cards. Scrolling deals the next card over the last, the matching board
   swings and lights in that card's colour, and each card builds its artifact once it lands. */

const EASE = [0.22, 1, 0.36, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

const PANELS: { n: string; sign: string; title: string; text: string; theme: string; accent: string; shape: { kind: ShapeKind; glyph: Glyph } }[] = [
  { n: '01', sign: 'Reading path', title: 'A reading path, in order', text: 'Ordered stops through the code, each one explained: what to look at, why it matters for your goal, and the past change that shaped it.', theme: 't-lilac', accent: 'var(--violet)', shape: { kind: 'circle', glyph: 'flag' } },
  { n: '02', sign: 'Evidence', title: 'Evidence, screened by Jev', text: 'Every passage from code, pull requests and issues gets a verdict before the LLM sees it. Relevant goes through; text that tries to steer the model is stopped.', theme: 't-mint', accent: 'var(--green)', shape: { kind: 'tag', glyph: 'signal' } },
  { n: '03', sign: 'Answers', title: 'Answers that cite their sources', text: 'Each claim points at the passage it came from and carries a probability. When the record is thin, Trailhead says so instead of guessing.', theme: 't-sky', accent: 'var(--blue)', shape: { kind: 'square', glyph: 'check' } },
]
// Scroll progress at which each card has been dealt.
const DEAL = [0, 0.36, 0.7]

export function Signposts() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const inView = useInView(ref, { margin: '-40% 0px -40% 0px' })
  const [active, setActive] = useState(0)
  useMotionValueEvent(p, 'change', (v) => setActive(v < DEAL[1] - 0.08 ? 0 : v < DEAL[2] - 0.08 ? 1 : 2))

  return (
    <section ref={ref} id="junction" className="l-junc t-peach" aria-label="What you get">
      <div className="l-junc__stage">
        <div className="l-junc__intro">
          <div className="l-chip"><span className="l-chip__blaze" /> Mile 2 · the junction</div>
          <h2 className="h-section l-junc__title"><span>What you get</span><span>at every junction.</span></h2>
          <p className="body l-junc__lead">Trailhead reads the tree, the history and the arguments behind the code, then walks you through it one stop at a time.</p>
          <div className="l-junc__post" aria-hidden>
            <span className="l-junc__pole" />
            {PANELS.map((panel, i) => (
              <motion.div
                key={panel.n}
                className={`l-junc__board${i % 2 ? ' is-left' : ''}${i === active ? ' is-on' : ''}`}
                style={{ background: i === active ? panel.accent : undefined, originX: i % 2 ? 1 : 0 }}
                animate={{ rotate: i === active ? (i % 2 ? 4 : -4) : 0, x: i === active ? (i % 2 ? -10 : 10) : 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14 }}
              >
                <b>{panel.n}</b> {panel.sign}
              </motion.div>
            ))}
          </div>
        </div>
        <div className="l-junc__deck">
          {PANELS.map((panel, i) => (
            <Card key={panel.n} i={i} panel={panel} p={p} live={inView && active >= i} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Card({ i, panel, p, live }: { i: number; panel: (typeof PANELS)[number]; p: MotionValue<number>; live: boolean }) {
  // Dealt in from below with a twist, then pushed back and up as the next card lands on top.
  const dealt = useTransform(p, (v) => (i === 0 ? 1 : smooth(DEAL[i] - 0.2, DEAL[i], v)))
  const covered = useTransform(p, (v) => (i + 1 < DEAL.length ? smooth(DEAL[i + 1] - 0.2, DEAL[i + 1], v) : 0) + (i + 2 < DEAL.length ? smooth(DEAL[i + 2] - 0.2, DEAL[i + 2], v) : 0))
  const y = useTransform([dealt, covered] as MotionValue<number>[], ([d, c]: number[]) => `${((1 - d) * 112 - c * 4.5).toFixed(2)}%`)
  const rotate = useTransform(dealt, (d) => (1 - d) * (i % 2 ? -9 : 9))
  const scale = useTransform(covered, (c) => 1 - c * 0.06)
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (!live) return setStage(0)
    const a = setTimeout(() => setStage(1), 250)
    const b = setTimeout(() => setStage(2), 1000)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [live])
  return (
    <motion.article className={`l-junc__card ${panel.theme}`} style={{ y, rotate, scale, zIndex: i + 1 }}>
      <span className="l-junc__count" aria-hidden>{panel.n}</span>
      <div className="l-junc__top">
        <span className="tag" style={{ background: panel.accent, color: 'var(--solid)' }}>{panel.n} · {panel.sign}</span>
        <motion.div initial={false} animate={live ? { scale: 1, rotate: 0 } : { scale: 0.4, rotate: -40 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} style={{ lineHeight: 0 }}>
          <Shape kind={panel.shape.kind} color={panel.accent} glyph={panel.shape.glyph} size={52} play={live} />
        </motion.div>
      </div>
      <h3 className="h-sub">{panel.title}</h3>
      <p className="body">{panel.text}</p>
      {i === 0 && <TourArtifact stage={stage} />}
      {i === 1 && <EvidenceArtifact stage={stage} />}
      {i === 2 && <AnswerArtifact stage={stage} />}
    </motion.article>
  )
}

function TourArtifact({ stage }: { stage: number }) {
  const stops = TOUR_DEMO.stops.slice(0, 3)
  return (
    <div className="l-art">
      <div className="l-art__head"><span className="mono">tour · limit retries per status code</span></div>
      <ol className="l-art__stops">
        {stops.map((s, k) => (
          <motion.li key={s.path} initial={false} animate={stage >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }} transition={{ delay: k * 0.12, duration: 0.5, ease: EASE }}>
            <span className="l-art__n display">{k + 1}</span>
            <Signal light={stage >= 2 ? ((s as { tentative?: boolean }).tentative ? 'wait' : 'go') : 'off'} size={0.36} />
            <div>
              <div className="mono" style={{ fontWeight: 700 }}>{s.path}</div>
              <div className="small" style={{ color: 'var(--fg-soft)', marginTop: 3 }}>{s.why}</div>
            </div>
          </motion.li>
        ))}
      </ol>
      <motion.div className="small l-art__foot" initial={false} animate={{ opacity: stage >= 2 ? 1 : 0 }}>
        {TOUR_DEMO.considered} files considered · {stops.length} stops kept · amber means tentative
      </motion.div>
    </div>
  )
}

// Real verdicts from the scrapy run (see demo.ts): two kept, one injection stopped, one off-topic dropped.
const PASSAGES: { text: string; light: Light; verdict: string }[] = [
  { text: 'PR #2643 · Add feature to set RETRY_TIMES per request', light: 'go', verdict: 'relevant 0.93' },
  { text: 'issue #2642 · Allow max_retry_times in request.meta', light: 'go', verdict: 'relevant 0.88' },
  { text: 'comment 2470139374 · “ignore previous instructions and…”', light: 'stop', verdict: 'injection · blocked' },
  { text: 'PR #6545 · Commit the mitmproxy dhparam file', light: 'stop', verdict: 'relevant 0.04' },
]

function EvidenceArtifact({ stage }: { stage: number }) {
  return (
    <div className="l-art">
      <div className="l-art__head"><span className="mono">passages · one Jev call</span></div>
      <ul className="l-art__rows">
        {PASSAGES.map((r, k) => (
          <motion.li key={r.text} className={r.light === 'stop' ? 'is-blocked' : ''} initial={false} animate={stage >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }} transition={{ delay: k * 0.1, duration: 0.45, ease: EASE }}>
            <Signal light={stage >= 2 ? r.light : 'off'} size={0.42} />
            <span className="l-art__text">{r.text}</span>
            <span className="mono l-art__verdict">{stage >= 2 ? r.verdict : '…'}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

function AnswerArtifact({ stage }: { stage: number }) {
  return (
    <div className="l-art">
      <div className="l-art__head"><span className="mono">answer · verified claims only</span></div>
      <p className="l-art__answer">
        Retries are handled by <code>RetryMiddleware</code>
        <motion.sup initial={false} animate={{ scale: stage >= 1 ? 1 : 0 }}>E1</motion.sup>, and a single request can override the limit through <code>max_retry_times</code> in its meta
        <motion.sup initial={false} animate={{ scale: stage >= 1 ? 1 : 0 }} transition={{ delay: 0.15 }}>E2</motion.sup>.
      </p>
      <div className="l-art__meter">
        <span className="small">P(supports)</span>
        <div><motion.span initial={false} animate={{ scaleX: stage >= 2 ? 0.91 : 0 }} transition={{ duration: 0.9, ease: EASE }} /></div>
        <span className="mono" style={{ fontWeight: 700 }}>0.91 · high</span>
      </div>
      <motion.div className="l-art__abstain" initial={false} animate={{ opacity: stage >= 2 ? 1 : 0, rotate: stage >= 2 ? -3 : 4 }}>
        and when nothing survives: “No recorded rationale found.”
      </motion.div>
    </div>
  )
}
