import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { COSTS, INJECTION, NAV_RESULTS, TOUR_RESULTS } from './receipts'

/* Mile 5, the receipts, as one full-bleed motion graphic. A desk thermal printer sits at the foot of
   the screen and prints a receipt up out of its slot; the receipt *is* the copy (headline, the
   sentence behind it, the numbers). Scroll feeds the paper out of the slot, the verdict stamp
   thumps down, then the slip tears off and gets pinned to the wall on alternating sides while the
   whole scene floods with the next receipt's colour. The last receipt stays under the printer. */

const EASE = [0.22, 1, 0.36, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
// Thermal paper feeds in little jerks.
const jerky = (t: number) => Math.round(t * 24) / 24

const SCENES = [
  {
    kicker: 'Receipt 1 · finding the right file',
    a: 'Right file,',
    b: 'first try.',
    accent: 'var(--green)',
    flood: 'var(--mint)',
    lead: `Mean reciprocal rank on hand-written “where is…” questions. Jev’s beam search ranks the right file highest: ${NAV_RESULTS[0].mrr.toFixed(3)}, against ${NAV_RESULTS[2].mrr.toFixed(3)} for BM25 and ${NAV_RESULTS[3].mrr.toFixed(3)} for embeddings.`,
  },
  {
    kicker: 'Receipt 2 · cost per search',
    a: 'Small reads,',
    b: 'small bills.',
    accent: 'var(--violet)',
    flood: 'var(--lilac)',
    lead: `One request per depth of the tree, every open branch asked at once. A search averages ${COSTS.requestsPerSearch} Jev requests and about ${COSTS.tokensPerSearch} input tokens.`,
  },
  {
    kicker: 'Receipt 3 · screening passages',
    a: 'Text aimed at',
    b: 'the model? Caught.',
    accent: 'var(--orange)',
    flood: 'var(--peach)',
    lead: `One call screens up to ${COSTS.retrievalPassages} passages (about ${COSTS.retrievalTokens} tokens). On the planted suite Jev caught ${INJECTION.jevCaught} of ${INJECTION.attacks} injections, with ${INJECTION.falseAlarms} false alarms on ${INJECTION.benign} benign passages.`,
  },
  {
    kicker: 'Receipt 4 · tours on real issues',
    a: 'Tours that',
    b: 'land on target.',
    accent: 'var(--blue)',
    flood: 'var(--sky)',
    lead: `On ${TOUR_RESULTS.n} closed good-first issues, Jev’s tour scores recall@7 of ${TOUR_RESULTS.jevRecall7} and MRR ${TOUR_RESULTS.jevMrr}, against ${TOUR_RESULTS.bm25Recall7} and ${TOUR_RESULTS.bm25Mrr} for BM25.`,
  },
]

type Line = [string, string, boolean?]
const SLIPS: { title: string; meta: string; lines: Line[]; total: [string, string]; stamp: string; ink: string }[] = [
  {
    title: 'Finding the right file',
    meta: 'MRR · hand-written where-is questions',
    lines: NAV_RESULTS.map((r) => [`${r.method} (n=${r.n})`, r.mrr.toFixed(3), r.ours] as Line),
    total: ['Best', NAV_RESULTS[0].mrr.toFixed(3)],
    stamp: 'Best',
    ink: 'var(--green)',
  },
  {
    title: 'Cost per search',
    meta: 'Jev beam search, averaged',
    lines: [['Jev requests', String(COSTS.requestsPerSearch), true], ['Input tokens', COSTS.tokensPerSearch], ['Requests per tree depth', '1'], ['Branches per request', 'all open']],
    total: ['Requests', String(COSTS.requestsPerSearch)],
    stamp: 'Lean',
    ink: 'var(--violet)',
  },
  {
    title: 'Screening passages',
    meta: 'relevance + directness + injection',
    lines: [['Passages per call', String(COSTS.retrievalPassages), true], ['Tokens per call', COSTS.retrievalTokens], ['Attacks caught', `${INJECTION.jevCaught}/${INJECTION.attacks}`, true], ['False alarms', `${INJECTION.falseAlarms}/${INJECTION.benign}`]],
    total: ['Caught', `${INJECTION.jevCaught}/${INJECTION.attacks}`],
    stamp: 'Caught',
    ink: 'var(--orange)',
  },
  {
    title: 'Tours on real issues',
    meta: `closed good-first issues · n=${TOUR_RESULTS.n}`,
    lines: [['Jev tour MRR', TOUR_RESULTS.jevMrr.toFixed(2), true], ['Similar-history MRR', TOUR_RESULTS.historyMrr.toFixed(3)], ['BM25 MRR', TOUR_RESULTS.bm25Mrr.toFixed(3)], ['Jev recall@7', String(TOUR_RESULTS.jevRecall7), true], ['BM25 recall@7', String(TOUR_RESULTS.bm25Recall7)]],
    total: ['Tour MRR', TOUR_RESULTS.jevMrr.toFixed(2)],
    stamp: 'Ahead',
    ink: 'var(--blue)',
  },
]
const N = SLIPS.length
// Phases inside each slip's stretch of scroll.
const FEED = [0.04, 0.6] as const
const STAMP = [0.62, 0.7] as const
const FLY = [0.8, 0.98] as const
// Where finished slips get pinned: alternate walls, stepping down. x in px from centre, y in px from the slot
// (negative is up); the slip scales about its bottom edge, and nothing may drop below the slot.
const wall = (k: number, w: number) => {
  const side = k % 2 ? 1 : -1
  const wide = w >= 980
  return { x: side * (wide ? Math.min(w * 0.33, 520) : w * 0.9), y: wide ? -240 + Math.floor(k / 2) * 225 : -260, s: wide ? 0.46 : 0.5, r: side * (5 + k * 2) }
}

function useWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export function Receipts() {
  const ref = useRef<HTMLElement>(null)
  const w = useWidth()
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [scene, setScene] = useState(0)
  const [printed, setPrinted] = useState(0)
  useMotionValueEvent(p, 'change', (v) => {
    setScene(Math.min(N - 1, Math.floor(v * N)))
    setPrinted(SLIPS.filter((_, k) => v * N - k >= STAMP[1]).length)
  })
  const feeding = useTransform(p, (v) => {
    const k = Math.min(N - 1, Math.floor(v * N))
    const t = v * N - k
    return t > FEED[0] && t < FEED[1] ? 1 : 0
  })
  const spin = useTransform(p, (v) => -v * N * 900)
  const led = useTransform(feeding, (f) => (f ? 'var(--lime)' : '#3a3940'))
  const press = useTransform(feeding, (f) => (f ? 3 : 0))
  // A printer at work hums: a tiny vertical buzz while the paper feeds.
  const shake = useTransform(p, (v) => {
    const t = v * N - Math.min(N - 1, Math.floor(v * N))
    return t > FEED[0] && t < FEED[1] ? Math.sin(t * 220) * 1.2 : 0
  })
  const s = SCENES[scene]

  return (
    <>
      <section ref={ref} id="receipts" className="l-rx t-sky" aria-label="The receipts: measured results">
        <motion.div className="l-rx__stage" animate={{ backgroundColor: s.flood }} transition={{ duration: 0.7, ease: EASE }}>
          <div className="l-rx__tags">
            <span className="tag">Mile 5</span>
            <span className="l-hero__chip">Measured on scrapy/scrapy</span>
          </div>
          <div className="l-rx__meter mono" aria-hidden>
            <span>receipt</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={scene} style={{ color: s.accent }} initial={{ y: '100%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }} exit={{ y: '-100%', opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}>
                {String(scene + 1).padStart(2, '0')}
              </motion.b>
            </AnimatePresence>
            <span>/ {String(N).padStart(2, '0')}</span>
            <div className="l-rx__ticks">
              {SCENES.map((x, i) => <i key={i} style={{ background: i <= scene ? x.accent : undefined }} />)}
            </div>
          </div>

          <motion.div className="l-rx__printer is-back" style={{ y: shake }} aria-hidden>
            <svg viewBox="0 0 600 240" className="l-rx__machine">
              <ellipse cx={300} cy={226} rx={286} ry={12} className="l-rx__shadow" />
              {/* the top deck, seen from a little above, and the clamshell lid over the paper roll */}
              <path d="M74 30 Q76 18 90 18 L510 18 Q524 18 526 30 L582 98 L18 98 Z" className="l-rx__deck" />
              <path d="M96 26 L504 26 L546 82 L54 82 Z" className="l-rx__lid" />
              <path d="M118 30 Q300 6 482 30 L496 48 Q300 26 104 48 Z" className="l-rx__roll" />
              <path d="M104 48 Q300 26 496 48" className="l-rx__seam" />
              {/* the paper roll turning, seen through the smoked window */}
              <motion.line x1={150} y1={58} x2={450} y2={58} className="l-rx__turn" style={{ strokeDashoffset: spin }} />
              <motion.line x1={140} y1={66} x2={460} y2={66} className="l-rx__turn is-mid" style={{ strokeDashoffset: spin }} />
            </svg>
          </motion.div>
          <div className="l-rx__run">
            {SLIPS.map((slip, k) => <Slip key={slip.title} k={k} slip={slip} p={p} w={w} />)}
          </div>
          {/* the paper passes between these two layers: in front of the lid, behind the slot's lip */}
          <motion.div className="l-rx__printer is-front" style={{ y: shake }} aria-hidden>
            <svg viewBox="0 0 600 240" className="l-rx__machine">
              {/* the slot the paper rises out of, with its tear bar */}
              <rect x={116} y={79} width={368} height={10} rx={5} className="l-rx__mouth" />
              <motion.rect x={124} y={80} width={352} height={4} rx={2} className="l-rx__glow" style={{ opacity: feeding }} />
              <path d={`M116 89 ${Array.from({ length: 30 }, (_, i) => `L${122 + i * 12} 95 L${128 + i * 12} 89`).join(' ')} L484 89 L484 92 L116 92 Z`} className="l-rx__teeth" />
              {/* the front face */}
              <path d="M18 98 L582 98 L582 196 Q582 216 562 216 L38 216 Q18 216 18 196 Z" className="l-rx__body" />
              <path d="M18 98 L582 98" className="l-rx__edge" />
              <circle cx={56} cy={136} r={7} className="l-rx__pwr" />
              <motion.circle cx={80} cy={136} r={7} style={{ fill: led }} />
              <text x={46} y={160} className="l-rx__tiny">PWR  FEED</text>
              <rect x={112} y={122} width={92} height={32} rx={8} className="l-rx__lcd" />
              <text x={158} y={143} textAnchor="middle" className="l-rx__lcdtext">{String(printed).padStart(2, '0')}/{String(N).padStart(2, '0')}</text>
              <text x={300} y={186} textAnchor="middle" className="l-rx__brand">TRAILHEAD · TP-5</text>
              {Array.from({ length: 6 }, (_, i) => <rect key={i} x={250 + i * 18} y={124} width={8} height={30} rx={4} className="l-rx__vent" />)}
              <motion.g style={{ y: press }}>
                <rect x={470} y={128} width={74} height={32} rx={12} className="l-rx__btn-base" />
                <rect x={470} y={123} width={74} height={32} rx={12} className="l-rx__btn" />
                <text x={507} y={143} textAnchor="middle" className="l-rx__btntext">FEED</text>
              </motion.g>
              <rect x={44} y={214} width={512} height={9} rx={4.5} className="l-rx__foot" />
            </svg>
          </motion.div>
        </motion.div>
      </section>
      <div className="l-rx__after t-sky">
        <motion.div className="l-receipts__void" initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.6 }} transition={{ duration: 0.6, ease: EASE }}>
          <span className="tag">and when nobody wrote down why</span>
          <span className="chunk">“No recorded rationale found.”</span>
          <span className="small">Scored on labelled why-questions: reliability, ECE, abstention rate.</span>
        </motion.div>
      </div>
    </>
  )
}

function Slip({ k, slip, p, w }: { k: number; slip: (typeof SLIPS)[number]; p: MotionValue<number>; w: number }) {
  const sc = SCENES[k]
  const local = useTransform(p, (v) => v * N - k)
  const feed = useTransform(local, (t) => jerky(smooth(FEED[0], FEED[1], t)))
  const stamp = useTransform(local, (t) => smooth(STAMP[0], STAMP[1], t))
  const fly = useTransform(local, (t) => (k === N - 1 ? 0 : smooth(FLY[0], FLY[1], t)))
  const to = wall(k, w)
  const x = useTransform(fly, (f) => lerp(0, to.x, f))
  const y = useTransform(fly, (f) => lerp(0, to.y, f) + Math.sin(f * Math.PI) * -60)
  const scale = useTransform(fly, (f) => lerp(1, to.s, f))
  // The tear: a kick against the direction of travel before it sails to the wall.
  const rotate = useTransform(fly, (f) => lerp(0, to.r, f) + Math.sin(f * Math.PI) * -to.r * 2.4)
  const shown = useTransform(local, (t) => (t > FEED[0] - 0.02 ? 1 : 0))
  // Paper rises out of the slot top edge first; everything below the slot is still inside the printer.
  const rise = useTransform(feed, (f) => `${((1 - f) * 100).toFixed(2)}%`)
  const stampScale = useTransform(stamp, (t) => lerp(2.6, 1, t))
  const stampRot = useTransform(stamp, (t) => lerp(-34, -12, t))
  return (
    <motion.div className="l-rx__slip" style={{ x, y, scale, rotate, opacity: shown, zIndex: 10 + k }}>
      <motion.div className="l-rx__paper-clip" style={{ y: rise }}>
        <article className="l-rx__paper">
          <div className="l-rx__ptop mono">
            <span>#{String(k + 1).padStart(3, '0')} · {slip.title}</span>
            <span>scrapy/scrapy</span>
          </div>
          <h2 className="l-rx__ptitle">
            {sc.a} <em style={{ color: sc.accent }}>{sc.b}</em>
          </h2>
          <p className="l-rx__plead">{sc.lead}</p>
          <ul className="l-rx__plines mono">
            {slip.lines.map(([name, v, bold]) => (
              <li key={name} className={bold ? 'is-bold' : ''}><span>{name}</span><i /><span>{v}</span></li>
            ))}
          </ul>
          <div className="l-rx__ptotal mono"><span>{slip.total[0]}</span><b>{slip.total[1]}</b></div>
          <div className="l-rx__pbars" />
          <motion.span className="l-rx__stamp" style={{ color: slip.ink, opacity: stamp, scale: stampScale, rotate: stampRot }}>
            {slip.stamp}
          </motion.span>
        </article>
      </motion.div>
    </motion.div>
  )
}
