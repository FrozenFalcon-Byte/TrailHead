import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { COSTS, INJECTION, NAV_RESULTS, TOUR_RESULTS } from './receipts'

/* Mile 5, the receipts, as one full-bleed motion graphic. A wide thermal printer hangs at the top of
   the screen and prints a receipt straight down the middle; the receipt *is* the copy (headline, the
   sentence behind it, the numbers). Scroll feeds the paper past the print head, the verdict stamp
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
// Where finished slips get pinned: alternate walls, stepping down. x in px from centre, y in px.
const wall = (k: number, w: number) => {
  const side = k % 2 ? 1 : -1
  const wide = w >= 980
  return { x: side * (wide ? Math.min(w * 0.33, 520) : w * 0.9), y: wide ? 50 + Math.floor(k / 2) * 230 : -260, s: wide ? 0.46 : 0.5, r: side * (5 + k * 2) }
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
  const roll = useTransform(p, (v) => `${(-v * N * 900).toFixed(1)}px 0`)
  const shake = useTransform(p, (v) => {
    const t = v * N - Math.min(N - 1, Math.floor(v * N))
    return t > FEED[0] && t < FEED[1] ? Math.sin(t * 160) * 1.4 : 0
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

          <motion.div className="l-rx__printer" style={{ rotate: shake }} aria-hidden>
            <motion.span className="l-rx__led" style={{ background: useTransform(feeding, (f) => (f ? 'var(--lime)' : 'var(--green)')) }} />
            <span className="mono l-rx__name">trailhead · eval printer</span>
            <span className="mono l-rx__count">{printed}/{N}</span>
            <div className="l-rx__slot">
              <motion.i style={{ backgroundPosition: roll }} />
            </div>
          </motion.div>

          <div className="l-rx__run">
            {SLIPS.map((slip, k) => <Slip key={slip.title} k={k} slip={slip} p={p} w={w} />)}
          </div>
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
  // Paper comes out of the slot from the top down; the print head is the moving edge.
  const reveal = useTransform(feed, (f) => `inset(0 0 ${((1 - f) * 100).toFixed(2)}% 0)`)
  const head = useTransform(feed, (f) => `${(f * 100).toFixed(2)}%`)
  const headOn = useTransform(local, (t) => (t > FEED[0] && t < FEED[1] + 0.02 ? 1 : 0))
  const stampScale = useTransform(stamp, (t) => lerp(2.6, 1, t))
  const stampRot = useTransform(stamp, (t) => lerp(-34, -12, t))
  return (
    <motion.div className="l-rx__slip" style={{ x, y, scale, rotate, opacity: shown, zIndex: 10 + k }}>
      <motion.div className="l-rx__paper-clip" style={{ clipPath: reveal }}>
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
      <motion.span className="l-rx__head" style={{ top: head, opacity: headOn }} />
    </motion.div>
  )
}
