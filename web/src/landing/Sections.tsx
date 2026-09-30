import { AnimatePresence, motion, useInView, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BeamColumns } from '../motion/BeamColumns'
import { Contours } from '../motion/Contours'
import { EvidenceCard } from '../motion/EvidenceCard'
import { Hiker } from '../motion/Hiker'
import { Mark } from '../motion/Mark'
import { Marquee } from '../motion/Marquee'
import { ScrubText } from '../motion/ScrubText'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailPath } from '../motion/TrailPath'
import { useSignedIn } from '../lib/auth'
import { EVIDENCE_DEMO, NAV_DEMO, TOUR_DEMO } from './demo'
import { COSTS, NAV_RESULTS, TOUR_BASELINES } from './receipts'

const EASE = [0.22, 1, 0.36, 1] as const

/* ---------- 1. Statement + fanning card stack ---------- */
export function Statement() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const spread = useTransform(scrollYProgress, [0.1, 0.55], [0, 1])
  const cards = [
    { rot: -9, x: -150, y: 20, bg: 'var(--ice)', body: <CardAnswer /> },
    { rot: 7, x: 150, y: -10, bg: 'var(--heather)', body: <CardEvidence /> },
    { rot: -2, x: 0, y: 0, bg: 'var(--paper)', body: <CardStop /> },
  ]
  return (
    <section className="l-section t-pine" style={{ paddingTop: 40 }}>
      <div className="l-center">
        <SplitReveal as="h2" className="lead" text="Trailhead reads the tree, the history and the arguments behind the code — then walks you through it, one stop at a time." stagger={0.03} />
      </div>
      <div ref={ref} className="l-stack">
        {cards.map((c, i) => (
          <StackCard key={i} spread={spread} {...c} i={i} />
        ))}
      </div>
    </section>
  )
}

function StackCard({ spread, rot, x, y, bg, body, i }: { spread: any; rot: number; x: number; y: number; bg: string; body: React.ReactNode; i: number }) {
  const rotate = useTransform(spread, [0, 1], [rot * 0.25, rot])
  const tx = useTransform(spread, [0, 1], [0, x])
  const ty = useTransform(spread, [0, 1], [i * -6, y])
  return (
    <motion.div className="l-card" style={{ rotate, x: tx, y: ty, translateX: '-50%', translateY: '-50%', background: bg, zIndex: i }}>
      {body}
    </motion.div>
  )
}

function CardStop() {
  const s = TOUR_DEMO.stops[0]
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="display" style={{ fontSize: 44, lineHeight: 0.8, background: 'var(--blaze)', color: 'var(--bark)', borderRadius: 8, padding: '4px 10px' }}>1</span>
        <div>
          <div className="small" style={{ opacity: 0.6 }}>Tour stop · need {s.need.toFixed(2)}</div>
          <div className="mono" style={{ fontWeight: 700 }}>{s.path}</div>
        </div>
      </div>
      <p className="body" style={{ margin: '0 0 12px' }}>{s.why}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {s.look.map((l) => <span key={l} className="pill mono" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>{l}</span>)}
        <span className="pill" style={{ background: 'var(--paper-2)', color: 'var(--ink)' }}>{s.past}</span>
      </div>
    </div>
  )
}
function CardEvidence() {
  return (
    <div>
      <div className="small" style={{ opacity: 0.6, marginBottom: 6 }}>Evidence · screened by Jev</div>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.03em', lineHeight: 1.05 }}>PR #2643 — Add feature to set RETRY_TIMES per request</div>
      <div className="small" style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <span className="pill" style={{ background: 'var(--ink)', color: 'var(--heather)' }}>relevant 0.93</span>
        <span className="pill" style={{ background: 'var(--ink)', color: 'var(--heather)' }}>injection 0.01</span>
      </div>
    </div>
  )
}
function CardAnswer() {
  return (
    <div>
      <div className="small" style={{ opacity: 0.6, marginBottom: 6 }}>Answer · verified claims only</div>
      <div style={{ fontWeight: 700, lineHeight: 1.3 }}>
        Retries are handled by <span className="mono">RetryMiddleware</span>, and a request can override the limit through <span className="mono">max_retry_times</span> in its meta <span className="pill" style={{ background: 'var(--glacier)', color: 'var(--ice)' }}>E2</span>
      </div>
      <div className="small" style={{ marginTop: 10 }}>
        <span className="pill" style={{ background: 'var(--glacier)', color: 'var(--ice)' }}>P(supports) 0.91 · high</span>
      </div>
    </div>
  )
}

/* ---------- 2. No guesswork + hiker + marquee ---------- */
export function NoGuesswork() {
  return (
    <section className="t-paper" style={{ overflow: 'hidden' }}>
      <div className="l-section l-split" style={{ paddingBottom: 40 }}>
        <div>
          <SplitReveal as="div" className="kicker" text="Finally" />
          <h2 className="display l-giant" style={{ margin: '6px 0 24px' }}>
            <SplitReveal text="No more" />
            <br />
            <SplitReveal text="grepping in" delay={0.1} />
            <br />
            <SplitReveal text="the dark" delay={0.2} />
          </h2>
          <SplitReveal as="p" className="lead" style={{ maxWidth: 760 }} delay={0.3} stagger={0.025} text="Where is it. How does it work. Why was it built this way. What breaks if I change it. Answered from the code and its history, with the receipts attached." />
        </div>
        <motion.div initial={{ x: 120, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 1.1, ease: EASE }} style={{ justifySelf: 'center', color: 'var(--ink)' }}>
          <Hiker size={260} speed={1.1} />
        </motion.div>
      </div>
      <div className="l-band">
        <Marquee speed={32}>
          {['Where is it?', 'How does it work?', 'Why is it like this?', 'What breaks?', 'How do I run it?'].map((q, i) => (
            <span className="l-band__item" key={q}>
              {i % 2 ? <span className="oblique">{q}</span> : q}
              <Mark size={40} animate={false} a="var(--ink)" b="var(--blaze)" />
            </span>
          ))}
        </Marquee>
      </div>
    </section>
  )
}

/* ---------- 3. Scroll-inked quote ---------- */
export function Quote() {
  return (
    <section className="l-section t-paper">
      <div className="l-center" style={{ textAlign: 'left' }}>
        <ScrubText className="l-quote" text="“Jev decides. The LLM only writes. Code owns the control flow. Every claim is checked against the passage it cites — and when the evidence is thin, Trailhead says so instead of guessing.”" />
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 34 }}>
          <div>
            <div style={{ fontWeight: 800 }}>The Trailhead rulebook</div>
            <div className="small" style={{ opacity: 0.6 }}>Rule one of seven</div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <motion.div whileHover={{ rotate: -4, y: -4 }} style={{ width: 120, height: 120, borderRadius: 16, background: 'var(--pine)', display: 'grid', placeItems: 'center', color: 'var(--lichen)' }}><Hiker size={54} /></motion.div>
            <motion.div whileHover={{ rotate: 4, y: -4 }} style={{ width: 120, height: 120, borderRadius: 16, background: 'var(--bark)', display: 'grid', placeItems: 'center' }}><Mark size={60} animate={false} /></motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 4. How it works: sticky, scroll-driven steps ---------- */
const STEPS = [
  { n: '01', title: 'Ingest', text: 'Clone the repository (never run it), parse every file with tree-sitter, and load the full history: commits, pull requests, issues, review threads, and the links between them.' },
  { n: '02', title: 'Navigate', text: 'Jev walks the directory tree like a hiker reading trail signs: one request per depth, every open branch asked at once, the three most likely kept, the rest pruned.' },
  { n: '03', title: 'Verify', text: 'Candidate passages are screened for relevance and for injected instructions. The LLM drafts claims; Jev checks each against what it cites. Unsupported claims are dropped.' },
  { n: '04', title: 'Walk', text: 'Stops are ordered by the import graph so each one builds on the last. Mark one as known and the trail re-plans instantly — the whole pool was judged in one request.' },
]

function IngestGraphic() {
  const stats = [['673', 'files'], ['7,090', 'symbols'], ['11,551', 'commits'], ['8,087', 'issues + PRs'], ['37,819', 'comments'], ['46,924', 'evidence rows']]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: '100%' }}>
      {stats.map(([v, l], i) => (
        <motion.div key={l} initial={{ opacity: 0, y: 30, rotate: i % 2 ? 3 : -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.07, duration: 0.6, ease: EASE }}
          style={{ borderRadius: 16, padding: '16px 18px', background: i === 2 ? 'var(--blaze)' : 'color-mix(in srgb, var(--fg) 10%, transparent)', color: i === 2 ? 'var(--bark)' : 'var(--fg)' }}>
          <div className="display" style={{ fontSize: 'clamp(34px, 4vw, 58px)' }}>{v}</div>
          <div className="small">{l}</div>
        </motion.div>
      ))}
      <div className="hand" style={{ gridColumn: '1 / -1', fontSize: 24, marginTop: 4 }}>scrapy/scrapy, ingested ↑</div>
    </div>
  )
}

function NavigateGraphic() {
  const [shown, setShown] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  useEffect(() => {
    if (!inView || shown >= NAV_DEMO.steps.length) return
    const timer = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 200 : 900)
    return () => clearTimeout(timer)
  }, [inView, shown])
  const kept = new Set(['scrapy/', 'downloadermiddlewares/', 'retry.py'])
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <div className="hand" style={{ fontSize: 26, marginBottom: 12 }}>“{NAV_DEMO.question}”</div>
      <BeamColumns steps={NAV_DEMO.steps} visible={shown} kept={kept} compact />
      <AnimatePresence>
        {shown >= NAV_DEMO.steps.length && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="small" style={{ marginTop: 12 }}>
            → <span className="mono">{NAV_DEMO.answer}</span> · path score {NAV_DEMO.score} · {NAV_DEMO.separation}× ahead of the runner-up
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function VerifyGraphic() {
  return (
    <div style={{ display: 'grid', gap: 12, width: '100%' }}>
      {EVIDENCE_DEMO.map((e, i) => <EvidenceCard key={e.ref} e={e} i={i} />)}
    </div>
  )
}

function WalkGraphic() {
  return (
    <div style={{ width: '100%' }}>
      <TrailPath stops={TOUR_DEMO.stops.map((s) => ({ label: s.path.split('/').pop()!, tentative: (s as { tentative?: boolean }).tentative }))} color="var(--blaze)" height={300} />
      <div className="hand" style={{ fontSize: 24, marginTop: 8 }}>{TOUR_DEMO.considered} files considered, 3 stops kept</div>
    </div>
  )
}

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  useMotionValueEvent(scrollYProgress, 'change', (v) => setActive(Math.min(STEPS.length - 1, Math.max(0, Math.floor(v * STEPS.length * 0.999)))))
  const bar = useTransform(scrollYProgress, [0, 1], [0, 1])
  const graphics = [<IngestGraphic key="i" />, <NavigateGraphic key="n" />, <VerifyGraphic key="v" />, <WalkGraphic key="w" />]
  return (
    <section id="how" className="t-bark">
      <div className="l-section" style={{ paddingBottom: 0 }}>
        <SplitReveal as="div" className="kicker" text="How it works" />
        <h2 className="display l-giant" style={{ marginTop: 8 }}>
          <SplitReveal text="From clone" />
          <br />
          <span className="oblique"><SplitReveal text="to clarity" delay={0.1} /></span>
        </h2>
      </div>
      <div ref={ref} className="l-how" style={{ height: `${STEPS.length * 100}vh` }}>
        <div className="l-how__sticky">
          <div className="l-how__stage">
            <AnimatePresence mode="wait">
              <motion.div key={active} className="l-how__step" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: 0.5, ease: EASE }}>
                <div className="display" style={{ fontSize: 'clamp(90px, 14vw, 220px)', opacity: 0.25 }}>{STEPS[active].n}</div>
                <h3 className="display" style={{ fontSize: 'clamp(54px, 7vw, 110px)', marginTop: -40 }}>{STEPS[active].title}</h3>
                <p className="body" style={{ maxWidth: 520, color: 'var(--fg-soft)', marginTop: 16 }}>{STEPS[active].text}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="l-how__stage">
            <AnimatePresence mode="wait">
              <motion.div key={active} style={{ width: '100%' }} initial={{ opacity: 0, scale: 0.94, rotate: -1.5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.5, ease: EASE }}>
                {graphics[active]}
              </motion.div>
            </AnimatePresence>
          </div>
          <div style={{ position: 'absolute', left: 'var(--gutter)', right: 'var(--gutter)', bottom: 28, display: 'flex', gap: 8, alignItems: 'center' }}>
            {STEPS.map((s, i) => (
              <span key={s.n} className="small" style={{ opacity: i === active ? 1 : 0.45, transition: 'opacity .3s' }}>{s.n} {s.title}</span>
            ))}
            <div style={{ flex: 1, height: 3, background: 'color-mix(in srgb, var(--fg) 20%, transparent)', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div style={{ height: '100%', background: 'var(--fg)', scaleX: bar, originX: 0 }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- 5. Mosaic of giant words with living tiles ---------- */
function Tile({ bg, children, rotate = 0 }: { bg: string; children: React.ReactNode; rotate?: number }) {
  return (
    <motion.span className="l-tile" style={{ background: bg }} initial={{ scale: 0, rotate: rotate * 3 }} whileInView={{ scale: 1, rotate }} viewport={{ once: true, amount: 0.6 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }} whileHover={{ rotate: -rotate, scale: 1.06 }}>
      {children}
    </motion.span>
  )
}

export function Mosaic() {
  return (
    <section className="l-section t-paper">
      <div className="display l-mosaic">
        <SplitReveal as="div" className="kicker" text="Our mission?" />
        <div className="l-mosaic__row"><SplitReveal text="Read the" /><Tile bg="var(--lichen)" rotate={-3}><div style={{ color: 'var(--pine)' }}><Hiker size={40} /></div></Tile></div>
        <div className="l-mosaic__row"><SplitReveal text="code in" /><span className="l-mosaic__small">the</span><SplitReveal text="order" /></div>
        <div className="l-mosaic__row"><Tile bg="var(--bark)" rotate={4}><Mark size={50} animate={false} /></Tile><SplitReveal text="it wants" /></div>
        <div className="l-mosaic__row"><span className="l-mosaic__small">to be</span><span className="oblique"><SplitReveal text="read." /></span><Tile bg="var(--glacier)" rotate={-4}><span className="hand" style={{ color: 'var(--ice)', fontSize: '0.22em' }}>0.99 ✓</span></Tile></div>
      </div>
    </section>
  )
}

/* ---------- 6. Receipts ---------- */
function Bar({ value, label, n, ours, i }: { value: number; label: string; n: number; ours?: boolean; i: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: ours ? 800 : 600, marginBottom: 6 }}>
        <span>{label}</span>
        <span>{value.toFixed(3)} <span className="small" style={{ opacity: 0.6 }}>n={n}</span></span>
      </div>
      <div style={{ height: 18, borderRadius: 6, background: 'color-mix(in srgb, var(--fg) 12%, transparent)', overflow: 'hidden' }}>
        <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: value }} viewport={{ once: true }} transition={{ duration: 1.2, delay: i * 0.12, ease: EASE }} style={{ height: '100%', originX: 0, background: ours ? 'var(--ice)' : 'color-mix(in srgb, var(--fg) 45%, transparent)' }} />
      </div>
    </div>
  )
}

export function Receipts() {
  return (
    <section id="receipts" className="l-section t-glacier">
      <div className="l-center">
        <h2 className="display l-giant"><SplitReveal text="The" /> <span className="oblique"><SplitReveal text="receipts" delay={0.1} /></span></h2>
        <SplitReveal as="p" className="lead" style={{ maxWidth: 900, margin: '20px auto 0' }} stagger={0.025} text="Measured on scrapy/scrapy against the obvious alternatives. Reproducible from cached calls with one command." />
      </div>
      <div className="l-stats">
        <div className="l-stat" style={{ gridColumn: 'span 2' }}>
          <div className="small" style={{ marginBottom: 14, opacity: 0.75 }}>Finding the right file · mean reciprocal rank on hand-written where-is questions</div>
          {NAV_RESULTS.map((r, i) => <Bar key={r.method} value={r.mrr} label={r.method} n={r.n} ours={r.ours} i={i} />)}
        </div>
        <div className="l-stat" style={{ background: 'var(--ice)', color: 'var(--glacier)' }}>
          <div className="display" style={{ fontSize: 'clamp(70px, 9vw, 130px)' }}>{COSTS.requestsPerSearch}</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>Jev requests per search</div>
          <p className="small" style={{ marginTop: 10 }}>One request per tree depth, with every open branch asked at once. About {COSTS.tokensPerSearch} input tokens.</p>
        </div>
        <div className="l-stat">
          <div className="display" style={{ fontSize: 'clamp(60px, 7vw, 100px)' }}>{COSTS.retrievalPassages}</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>passages screened in one call</div>
          <p className="small" style={{ marginTop: 10, color: 'var(--fg-soft)' }}>Relevance, directness and injection, all answered in a single {COSTS.retrievalTokens}-token request.</p>
        </div>
        <div className="l-stat">
          <div className="display" style={{ fontSize: 'clamp(60px, 7vw, 100px)' }}>{TOUR_BASELINES.issues}</div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em' }}>closed good-first issues</div>
          <p className="small" style={{ marginTop: 10, color: 'var(--fg-soft)' }}>Tour eval with the fixing pull request hidden. Baselines to beat: BM25 recall@7 {TOUR_BASELINES.bm25Recall7}, similar-history {TOUR_BASELINES.historyRecall7}.</p>
        </div>
        <div className="l-stat" style={{ background: 'var(--glacier)', boxShadow: 'inset 0 0 0 2px var(--ice)' }}>
          <div className="hand" style={{ fontSize: 34, color: 'var(--ice)' }}>“No recorded rationale found.”</div>
          <p className="small" style={{ marginTop: 12, color: 'var(--fg-soft)' }}>What Trailhead says when nobody wrote down why. Calibration is scored on labelled why-questions: reliability diagram, ECE, abstention rate.</p>
        </div>
      </div>
    </section>
  )
}

/* ---------- 7. Rules of the trail ---------- */
const RULES = [
  ['Repo text is data, never instructions', 'Every passage is screened for text aimed at an AI. It is escaped, delimited and never obeyed.'],
  ['No repository code is ever run', 'Trailhead clones and parses. It never installs, imports or executes what it reads.'],
  ['Secrets stay home', '.env and secret-looking files are never sent to any model or service.'],
  ['Every decision is on the record', 'Each Jev call is logged with its probabilities, cached on disk, and replayable offline.'],
  ['It abstains instead of guessing', 'No verified claim that addresses the question means no answer. Thin evidence is labelled as thin.'],
]

export function Rules() {
  return (
    <section id="rules" className="l-section t-plum">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <h2 className="display l-giant"><SplitReveal text="Rules of" /> <span className="oblique"><SplitReveal text="the trail" delay={0.1} /></span></h2>
        <ol className="l-rules" style={{ listStyle: 'none', padding: 0, margin: '40px 0 0' }}>
          {RULES.map(([title, text], i) => (
            <motion.li key={title} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7, delay: i * 0.05, ease: EASE }}>
              <span className="display" style={{ fontSize: 54, lineHeight: 0.9 }}>0{i + 1}</span>
              <div>
                <div className="chunk" style={{ fontSize: 'clamp(26px, 3.2vw, 44px)' }}>{title}</div>
                <p className="body" style={{ margin: '10px 0 0', color: 'var(--fg-soft)', maxWidth: 720 }}>{text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
      <motion.div style={{ position: 'absolute', right: '-2%', bottom: -20, color: 'var(--heather)', opacity: 0.9 }} initial={{ x: 200 }} whileInView={{ x: 0 }} viewport={{ once: true }} transition={{ duration: 1.4, ease: EASE }}>
        <Hiker size={180} />
      </motion.div>
    </section>
  )
}

/* ---------- 8. FAQ ---------- */
const FAQ = [
  ['What is Jev?', 'Jev is TypeSafe’s decision model. It answers structured questions — yes/no, pick-one, rate-on-a-scale — with calibrated probabilities. Trailhead uses it for every judgment: routing, navigation, relevance, verification. The LLM only writes prose from what Jev has verified.'],
  ['Which repositories work?', 'Any public GitHub repository. Trailhead ingests the file tree, symbols (Python is parsed in depth), commits, pull requests, issues and review threads. The first ingest of a large project takes a while; after that everything is incremental and cached.'],
  ['Why is it sometimes slow?', 'The free Jev tier allows one request a minute, so a fresh question can take a few minutes. The dashboard shows exactly when the next request slot opens, and anything asked before comes back instantly from the cache.'],
  ['Will it make things up?', 'It is built not to. Claims must cite a passage, Jev checks each one against that passage, and the final prose is checked in code and by Jev for added facts. When nothing survives, it tells you it could not find a recorded answer.'],
  ['What happens to my data?', 'Your account and saved tours live in your own Supabase project behind row-level security. Repository analysis stays on the Trailhead server; secrets and .env files are never sent anywhere.'],
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="l-section t-paper">
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <h2 className="display l-giant" style={{ marginBottom: 30 }}><SplitReveal text="Trail" /> <span className="oblique"><SplitReveal text="questions" delay={0.1} /></span></h2>
        {FAQ.map(([q, a], i) => (
          <div key={q} style={{ borderTop: '2.5px solid var(--ink)' }}>
            <button className="l-faq__q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              <span>{q}</span>
              <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} className="display" style={{ fontSize: 40, lineHeight: 1 }}>+</motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} style={{ overflow: 'hidden' }}>
                  <p className="body" style={{ margin: '0 0 26px', maxWidth: 760, color: 'var(--fg-soft)' }}>{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- 9. CTA + footer ---------- */
export function Cta() {
  const signedIn = useSignedIn()
  return (
    <section className="l-section t-paper" style={{ paddingTop: 20 }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 30, alignItems: 'end' }}>
        <div>
          <h2 className="display l-giant"><SplitReveal text="Ready to hit" /><br /><span className="oblique"><SplitReveal text="the trail?" delay={0.1} /></span></h2>
          <SplitReveal as="p" className="lead" style={{ maxWidth: 720, margin: '22px 0 28px' }} stagger={0.03} text="Sign in with GitHub or Google, pick a repository, and ask your first question." />
          <Link className="btn" to={signedIn ? '/app' : '/signup'} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}>
            <span>{signedIn ? 'Open your dashboard' : 'Create your account'}</span>
            <span className="arrow">→</span>
          </Link>
        </div>
        <TrailSign />
      </div>
    </section>
  )
}

function TrailSign() {
  return (
    <motion.svg width={220} height={260} viewBox="0 0 220 260" initial="hidden" whileInView="shown" viewport={{ once: true, amount: 0.5 }} aria-hidden>
      <motion.rect x={100} y={40} width={14} height={220} rx={3} fill="var(--ink)" variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1 } }} style={{ originY: 1 }} transition={{ duration: 0.8, ease: EASE }} />
      <motion.g variants={{ hidden: { opacity: 0, x: -40, rotate: -12 }, shown: { opacity: 1, x: 0, rotate: -4 } }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 14 }}>
        <path d="M20 50 H170 L200 72 L170 94 H20 Z" fill="var(--blaze)" />
        <text x={32} y={82} fontFamily="Anton, Impact" fontSize={30} fill="var(--bark)">TRAILHEAD</text>
      </motion.g>
      <motion.g variants={{ hidden: { opacity: 0, x: 40, rotate: 12 }, shown: { opacity: 1, x: 0, rotate: 3 } }} transition={{ delay: 0.7, type: 'spring', stiffness: 200, damping: 14 }}>
        <path d="M190 110 H44 L16 130 L44 150 H190 Z" fill="var(--pine)" />
        <text x={58} y={140} fontFamily="Anton, Impact" fontSize={24} fill="var(--lichen)">0.4 MI ↑</text>
      </motion.g>
    </motion.svg>
  )
}

export function Footer({ onJump }: { onJump: (id: string) => void }) {
  return (
    <footer className="l-footer t-pine">
      <Contours color="var(--lichen)" opacity={0.08} rings={8} draw={false} />
      <div className="display l-footer__word" style={{ position: 'relative' }}>
        <SplitReveal text="Trailhead" />
      </div>
      <div className="l-footer__cols" style={{ position: 'relative' }}>
        <div>
          <div className="small" style={{ opacity: 0.6 }}>Product</div>
          <a href="#how" onClick={(e) => { e.preventDefault(); onJump('how') }}>How it works</a>
          <a href="#receipts" onClick={(e) => { e.preventDefault(); onJump('receipts') }}>Receipts</a>
          <a href="#rules" onClick={(e) => { e.preventDefault(); onJump('rules') }}>Guardrails</a>
        </div>
        <div>
          <div className="small" style={{ opacity: 0.6 }}>Account</div>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/app">Dashboard</Link>
        </div>
        <div>
          <div className="small" style={{ opacity: 0.6 }}>Built on</div>
          <a href="https://github.com/scrapy/scrapy" target="_blank" rel="noreferrer">scrapy/scrapy</a>
          <span style={{ display: 'block', margin: '6px 0', fontWeight: 650 }}>Jev by TypeSafe</span>
          <span style={{ display: 'block', margin: '6px 0', fontWeight: 650 }}>Supabase</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 14 }}>
          <span className="hand" style={{ fontSize: 26, color: 'var(--blaze)' }}>see you on the trail</span>
          <Hiker size={70} />
        </div>
      </div>
      <div className="small" style={{ position: 'relative', marginTop: 40, display: 'flex', justifyContent: 'space-between', opacity: 0.7, flexWrap: 'wrap', gap: 10 }}>
        <span>© {new Date().getFullYear()} Trailhead</span>
        <span>Jev decides · the LLM writes · code owns control flow</span>
      </div>
    </footer>
  )
}
