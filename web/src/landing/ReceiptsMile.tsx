import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, useState, type ReactNode } from 'react'
import { Shape, STORY } from '../motion/Shapes'
import { COSTS, INJECTION, NAV_RESULTS, TOUR_RESULTS } from './receipts'

/* Mile 5, the receipts, as a pinned motion graphic in four scenes. Every number is drawn, not printed:
   1. A race: each method runs its lane out to its MRR.
   2. The bill: one request per tree depth fills up (3.6 on average) and the input tokens stack up as tiles.
   3. Screening: a scanner sweeps the planted attacks and benign passages, and stamps each one.
   4. Tours: recall@7 columns rise, with the answer flag riding the tallest. */

const EASE = [0.22, 1, 0.36, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

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
const N = SCENES.length

export function Receipts() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [scene, setScene] = useState(0)
  useMotionValueEvent(p, 'change', (v) => setScene(Math.min(N - 1, Math.floor(v * N))))
  // Each scene draws over the first ~75% of its own stretch of scroll, then holds so it can be read.
  const t0 = useTransform(p, (v) => smooth(0.04, 0.72, v * N))
  const t1 = useTransform(p, (v) => smooth(0.04, 0.72, v * N - 1))
  const t2 = useTransform(p, (v) => smooth(0.04, 0.72, v * N - 2))
  const t3 = useTransform(p, (v) => smooth(0.04, 0.72, v * N - 3))
  const ts = [t0, t1, t2, t3]
  const s = SCENES[scene]
  const charts: ReactNode[] = [<Race key="r" t={t0} />, <Bill key="b" t={t1} />, <Screen key="s" t={t2} />, <Tours key="t" t={t3} />]

  return (
    <>
      <section ref={ref} id="receipts" className="l-rx t-sky" aria-label="The receipts: measured results">
        <div className="l-lost__stage">
          <div className="l-lost__copy">
            <div className="l-head__tags">
              <span className="tag">Mile 5</span>
              <span className="l-hero__chip">Measured on scrapy/scrapy</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={scene} initial="in" animate="on" exit="out">
                <motion.div className="mono l-rx__kicker" style={{ color: s.accent }} variants={{ in: { opacity: 0, y: 14 }, on: { opacity: 1, y: 0 }, out: { opacity: 0, y: -10 } }} transition={{ duration: 0.4, ease: EASE }}>
                  {s.kicker}
                </motion.div>
                <h2 className="h-section l-lost__title">
                  {[s.a, s.b].map((line, i) => (
                    <span key={line} className="l-lost__line">
                      <motion.span style={i === 1 ? { color: s.accent } : undefined} variants={{ in: { y: '110%' }, on: { y: '0%' }, out: { y: '-110%' } }} transition={{ duration: 0.55, delay: i * 0.06, ease: [0.76, 0, 0.24, 1] }}>
                        {line}
                      </motion.span>
                    </span>
                  ))}
                </h2>
                <motion.p className="body l-lost__lead" variants={{ in: { opacity: 0, y: 18 }, on: { opacity: 1, y: 0 }, out: { opacity: 0 } }} transition={{ duration: 0.5, delay: 0.18, ease: EASE }}>
                  {s.lead}
                </motion.p>
              </motion.div>
            </AnimatePresence>
            <div className="l-lost__progress" aria-hidden>
              {SCENES.map((x, i) => <span key={i} className={i <= scene ? 'is-on' : ''} style={i === scene ? { background: x.accent } : undefined} />)}
            </div>
          </div>

          <div className="l-mg l-rx__frame" aria-hidden style={{ background: `color-mix(in srgb, ${s.flood} 70%, var(--surface))` }}>
            <div className="l-mg__bar">
              <AnimatePresence mode="wait">
                <motion.div key={scene} className="mono l-mg__status" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.25 }}>
                  <Status scene={scene} t={ts[scene]} />
                </motion.div>
              </AnimatePresence>
              <div className="l-mg__signal">
                {SCENES.map((x, i) => <span key={i} style={{ background: i === scene ? x.accent : undefined }} className={i === scene ? 'is-on' : ''} />)}
              </div>
            </div>
            <div className="l-mg__field">
              <AnimatePresence mode="wait">
                <motion.div
                  key={scene}
                  className="l-rx__chart"
                  initial={{ clipPath: 'circle(0% at 50% 50%)', scale: 1.06 }}
                  animate={{ clipPath: 'circle(75% at 50% 50%)', scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.22 } }}
                  transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
                >
                  {charts[scene]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
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

function Status({ scene, t }: { scene: number; t: MotionValue<number> }) {
  const mrr = useTransform(t, (v) => (NAV_RESULTS[0].mrr * smooth(0, 0.7, v)).toFixed(3))
  const req = useTransform(t, (v) => (COSTS.requestsPerSearch * smooth(0, 0.55, v)).toFixed(1))
  const caught = useTransform(t, (v) => String(ATTACKS.filter((k) => CAUGHT.has(k) && scanX(v) > tilePos(k).x).length))
  const rec = useTransform(t, (v) => (TOUR_RESULTS.jevRecall7 * smooth(0.05, 0.75, v)).toFixed(3))
  if (scene === 0) return <>MRR · where-is questions · beam <b><motion.span>{mrr}</motion.span></b></>
  if (scene === 1) return <><b><motion.span>{req}</motion.span></b> requests · {COSTS.tokensPerSearch} tokens / search</>
  if (scene === 2) return <>caught <b className="is-go"><motion.span>{caught}</motion.span>/{INJECTION.attacks}</b> · false alarms <b>{INJECTION.falseAlarms}/{INJECTION.benign}</b></>
  return <>recall@7 · n={TOUR_RESULTS.n} issues · Jev <b><motion.span>{rec}</motion.span></b></>
}

/* ---------- 1. the race ---------- */
const LANE_X = 8
const LANE_W = 80
function Race({ t }: { t: MotionValue<number> }) {
  const best = useTransform(t, (v) => smooth(0.86, 0.96, v))
  return (
    <>
      {[0, 0.25, 0.5, 0.75, 1].map((x) => (
        <span key={x} className="l-rx__tick" style={{ left: `${LANE_X + LANE_W * x}%` }}>
          <i className="mono">{x.toFixed(2)}</i>
        </span>
      ))}
      {NAV_RESULTS.map((r, i) => <Runner key={r.method} i={i} mrr={r.mrr} name={`${r.method} · n=${r.n}`} ours={!!r.ours} t={t} />)}
      <motion.span className="l-rx__best" style={{ left: '92%', top: '11%', scale: best, opacity: best }}>
        Best
      </motion.span>
    </>
  )
}
function Runner({ i, mrr, name, ours, t }: { i: number; mrr: number; name: string; ours: boolean; t: MotionValue<number> }) {
  const e = useTransform(t, (v) => smooth(i * 0.05, 0.72 + i * 0.05, v))
  const left = useTransform(e, (k) => `${(LANE_X + LANE_W * mrr * k).toFixed(2)}%`)
  const fill = useTransform(e, (k) => mrr * k)
  const val = useTransform(e, (k) => (mrr * k).toFixed(3))
  const spin = useTransform(e, (k) => k * 360 * (ours ? 1 : 0.5))
  const y = 22 + i * 19
  const color = ours ? (i === 0 ? 'var(--green)' : 'var(--lime)') : 'var(--dim)'
  return (
    <>
      <span className="mono l-rx__lane-label" style={{ top: `${y - 10}%`, left: `${LANE_X}%` }}>{name}</span>
      <span className="l-rx__track" style={{ top: `${y}%`, left: `${LANE_X}%`, width: `${LANE_W}%` }}>
        <motion.i style={{ scaleX: fill, background: color }} />
      </span>
      <motion.span className="l-rx__runner" style={{ left, top: `${y}%`, rotate: spin }}>
        {ours ? (
          <Shape kind={i === 0 ? 'square' : 'circle'} color={color} glyph="branch" size={0} play={false} style={{ width: '100%', height: 'auto' }} />
        ) : (
          <Shape kind={i === 2 ? 'square' : 'circle'} color="var(--dim)" size={0} style={{ width: '100%', height: 'auto' }} />
        )}
      </motion.span>
      <motion.span className="mono l-rx__val" style={{ left, top: `${y}%` }}>{val}</motion.span>
    </>
  )
}

/* ---------- 2. the bill ---------- */
const DEPTHS = 4
const TOKENS = Math.round(parseFloat(COSTS.tokensPerSearch) * 10) // tiles of 100 tokens
const TOK_COLS = 15
function Bill({ t }: { t: MotionValue<number> }) {
  return (
    <>
      {Array.from({ length: DEPTHS }, (_, i) => <Request key={i} i={i} t={t} />)}
      <span className="mono l-rx__lane-label" style={{ top: '49%', left: '7%' }}>input tokens · one tile = 100</span>
      {Array.from({ length: TOK_COLS * 3 }, (_, i) => (i < TOKENS ? <Token key={i} i={i} t={t} /> : null))}
    </>
  )
}
function Request({ i, t }: { i: number; t: MotionValue<number> }) {
  const f = useTransform(t, (v) => clamp01(COSTS.requestsPerSearch * smooth(0, 0.55, v) - i))
  const clip = useTransform(f, (k) => `inset(${((1 - k) * 100).toFixed(1)}% 0 0 0)`)
  const pop = useTransform(f, (k) => 0.92 + 0.08 * Math.min(1, k * 1.4))
  const x = 7 + i * 23
  return (
    <motion.div className="l-rx__req" style={{ left: `${x}%`, scale: pop }}>
      <motion.span className="l-rx__req-fill" style={{ clipPath: clip }}>
        <Shape kind="circle" color="var(--violet)" glyph="branch" size={0} play={false} style={{ width: '100%', height: 'auto' }} />
      </motion.span>
      <span className="mono l-rx__req-label">depth {i + 1}</span>
    </motion.div>
  )
}
function Token({ i, t }: { i: number; t: MotionValue<number> }) {
  const at = i / TOKENS
  const k = useTransform(t, (v) => smooth(0.3 + at * 0.55, 0.36 + at * 0.55, v))
  const r = Math.floor(i / TOK_COLS)
  const c = i % TOK_COLS
  return (
    <motion.span
      className="l-rx__tok"
      style={{ left: `${7 + c * 5.95}%`, top: `${57 + r * 12}%`, scale: k, rotate: useTransform(k, (q) => (1 - q) * 90), background: i % 7 === 3 ? 'var(--lime)' : 'var(--violet)' }}
    />
  )
}

/* ---------- 3. screening ---------- */
const SCOLS = 9
const SN = INJECTION.attacks + INJECTION.benign
// A fixed shuffle: which slots hold planted attacks, and which two slip through.
const ATTACKS = [0, 2, 3, 6, 7, 9, 11, 12, 14, 16, 17, 19, 21, 22, 24, 25].slice(0, INJECTION.attacks)
const MISSED = new Set(ATTACKS.filter((_, k) => k === 5 || k === 12).slice(0, INJECTION.attacks - INJECTION.jevCaught))
const CAUGHT = new Set(ATTACKS.filter((k) => !MISSED.has(k)))
const tilePos = (i: number) => ({ x: 8 + (i % SCOLS) * (84 / (SCOLS - 1)), y: 22 + Math.floor(i / SCOLS) * 26 })
const scanX = (v: number) => -4 + smooth(0.05, 0.85, v) * 108
function Screen({ t }: { t: MotionValue<number> }) {
  const x = useTransform(t, (v) => `${scanX(v).toFixed(2)}%`)
  return (
    <>
      {Array.from({ length: SN }, (_, i) => <Passage key={i} i={i} t={t} />)}
      <motion.span className="l-rx__scan" style={{ left: x }} />
      <div className="l-rx__legend mono">
        <span><i style={{ background: 'var(--stop)' }} /> caught</span>
        <span><i style={{ background: 'var(--yellow)' }} /> slipped</span>
        <span><i style={{ background: 'var(--green)' }} /> benign, passed</span>
      </div>
    </>
  )
}
function Passage({ i, t }: { i: number; t: MotionValue<number> }) {
  const { x, y } = tilePos(i)
  const attack = ATTACKS.includes(i)
  const verdict = !attack ? 'ok' : CAUGHT.has(i) ? 'caught' : 'missed'
  const done = useTransform(t, (v) => (scanX(v) > x ? 1 : 0))
  const [on, setOn] = useState(() => done.get() === 1)
  useMotionValueEvent(done, 'change', (d) => setOn(d === 1))
  const color = verdict === 'caught' ? 'var(--stop)' : verdict === 'missed' ? 'var(--yellow)' : 'var(--green)'
  return (
    <motion.span
      className="l-rx__psg"
      style={{ left: `${x}%`, top: `${y}%` }}
      animate={on ? { background: color, scale: verdict === 'caught' ? [1, 1.25, 1] : 1, rotate: verdict === 'caught' ? -8 : 0 } : { background: 'var(--surface)', scale: 1, rotate: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <span className="l-rx__psg-lines" />
      <motion.b animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.3 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
        {verdict === 'caught' ? '✕' : verdict === 'missed' ? '!' : '✓'}
      </motion.b>
    </motion.span>
  )
}

/* ---------- 4. tours ---------- */
const COLS = [
  { name: 'Jev tour', recall: TOUR_RESULTS.jevRecall7, mrr: TOUR_RESULTS.jevMrr, color: 'var(--blue)', ours: true },
  { name: 'Similar history', recall: TOUR_RESULTS.historyRecall7, mrr: TOUR_RESULTS.historyMrr, color: 'var(--yellow)' },
  { name: 'BM25', recall: TOUR_RESULTS.bm25Recall7, mrr: TOUR_RESULTS.bm25Mrr, color: 'var(--dim)' },
]
const BASE = 80
const TALL = 82
function Tours({ t }: { t: MotionValue<number> }) {
  return (
    <>
      <span className="l-rx__base" style={{ top: `${BASE}%` }} />
      {COLS.map((c, i) => <Column key={c.name} i={i} c={c} t={t} />)}
    </>
  )
}
function Column({ i, c, t }: { i: number; c: (typeof COLS)[number]; t: MotionValue<number> }) {
  const e = useTransform(t, (v) => smooth(0.05 + i * 0.08, 0.7 + i * 0.05, v))
  const h = useTransform(e, (k) => `${(c.recall * TALL * k).toFixed(2)}%`)
  const top = useTransform(e, (k) => `${(BASE - c.recall * TALL * k).toFixed(2)}%`)
  const val = useTransform(e, (k) => (c.recall * k).toFixed(3))
  const x = 14 + i * 27
  const st = STORY[4]
  return (
    <>
      <motion.span className="l-rx__col" style={{ left: `${x}%`, height: h, bottom: `${100 - BASE}%`, background: c.color }} />
      <motion.span className="l-rx__cap" style={{ left: `${x + 9}%`, top }}>
        {c.ours ? (
          <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
        ) : (
          <Shape kind={i === 1 ? 'square' : 'circle'} color={c.color} size={0} style={{ width: '100%', height: 'auto' }} />
        )}
        <motion.span className="mono l-rx__cap-val">{val}</motion.span>
      </motion.span>
      <span className="l-rx__col-name" style={{ left: `${x}%`, top: `${BASE + 3}%` }}>
        <b>{c.name}</b>
        <span className="mono">MRR {c.mrr}</span>
      </span>
    </>
  )
}
