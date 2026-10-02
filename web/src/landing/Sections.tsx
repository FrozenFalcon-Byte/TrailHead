import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BeamColumns } from '../motion/BeamColumns'
import { EvidenceCard } from '../motion/EvidenceCard'
import { Mark } from '../motion/Mark'
import { ScrubText } from '../motion/ScrubText'
import { Shape, STORY, type Glyph, type ShapeKind } from '../motion/Shapes'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailPath } from '../motion/TrailPath'
import { useSignedIn } from '../lib/auth'
import { EVIDENCE_DEMO, NAV_DEMO, TOUR_DEMO } from './demo'

const EASE = [0.22, 1, 0.36, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Section heading: an arrow-tag step number, a label, and a big line of display type that rises in. */
function Heading({ n, label, children, center }: { n: string; label: string; children: string; center?: boolean }) {
  return (
    <div className={`l-head${center ? ' is-center' : ''}`}>
      <motion.div className="l-head__tags" initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: EASE }}>
        <span className="tag">{n}</span>
        <span className="l-hero__chip">{label}</span>
      </motion.div>
      <SplitReveal as="h2" className="display l-giant" text={children} />
    </div>
  )
}

/* ---------- How it works: sticky, scroll-driven steps ---------- */
const STEPS: { n: string; title: string; text: string; shape: { kind: ShapeKind; color: string; glyph: Glyph } }[] = [
  { n: '01', title: 'Ingest', text: 'Clone the repository (never run it), parse every file with tree-sitter, and load the full history: commits, pull requests, issues, review threads, and the links between them.', shape: STORY[0] },
  { n: '02', title: 'Navigate', text: 'Jev walks the directory tree one decision at a time: one request per depth, every open branch asked at once, the three most likely kept, the rest pruned.', shape: STORY[1] },
  { n: '03', title: 'Verify', text: 'Candidate passages are screened for relevance and for injected instructions. The LLM drafts claims; Jev checks each against what it cites. Unsupported claims are dropped.', shape: STORY[2] },
  { n: '04', title: 'Walk', text: 'Stops are ordered by the import graph so each one builds on the last. Mark one as known and the trail re-plans instantly, because the whole pool was judged in one request.', shape: STORY[4] },
]

function IngestGraphic() {
  const stats = [['673', 'files'], ['7,090', 'symbols'], ['11,551', 'commits'], ['8,087', 'issues + PRs'], ['37,819', 'comments'], ['46,924', 'evidence rows']]
  const fills = ['var(--violet)', 'var(--surface)', 'var(--lime)', 'var(--surface)', 'var(--surface)', 'var(--orange)']
  return (
    <div className="l-ingest">
      {stats.map(([v, l], i) => (
        <motion.div key={l} className="l-ingest__cell" initial={{ opacity: 0, y: 30, rotate: i % 2 ? 4 : -4 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.07, duration: 0.6, ease: EASE }}
          style={{ background: fills[i], color: fills[i] === 'var(--surface)' ? 'var(--ink)' : 'var(--solid)' }}>
          <div className="display" style={{ fontSize: 'clamp(28px, 3.2vw, 46px)' }}>{v}</div>
          <div className="small">{l}</div>
        </motion.div>
      ))}
      <div className="small" style={{ gridColumn: '1 / -1', opacity: 0.7 }}>scrapy/scrapy, ingested</div>
    </div>
  )
}

/** Driven by scroll: each column of the beam search opens as you move through the step, so it keeps pace with you. */
function NavigateGraphic({ local }: { local: MotionValue<number> }) {
  const total = NAV_DEMO.steps.length
  const [shown, setShown] = useState(1)
  useMotionValueEvent(local, 'change', (t) => setShown(Math.max(1, Math.min(total, 1 + Math.floor(t * (total + 0.4))))))
  const kept = new Set(['scrapy/', 'downloadermiddlewares/', 'retry.py'])
  return (
    <div style={{ width: '100%' }}>
      <div className="lead" style={{ fontSize: 20, marginBottom: 12 }}>“{NAV_DEMO.question}”</div>
      <BeamColumns steps={NAV_DEMO.steps} visible={shown} kept={kept} compact />
      <motion.div initial={false} animate={{ opacity: shown >= total ? 1 : 0, y: shown >= total ? 0 : 10 }} transition={{ duration: 0.4 }} className="small" style={{ marginTop: 12 }}>
        → <span className="mono">{NAV_DEMO.answer}</span> · path score {NAV_DEMO.score} · {NAV_DEMO.separation}× ahead of the runner-up
      </motion.div>
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
      <TrailPath stops={TOUR_DEMO.stops.map((s) => ({ label: s.path.split('/').pop()!, tentative: (s as { tentative?: boolean }).tentative }))} color="var(--ink)" height={300} />
      <div className="small" style={{ marginTop: 8, opacity: 0.7 }}>{TOUR_DEMO.considered} files considered, 3 stops kept</div>
    </div>
  )
}

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  const n = STEPS.length
  const [active, setActive] = useState(0)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  // The first screen of scroll is the intro: the heading starts big and docks into the corner as the steps come up.
  const introEnd = 1 / (n + 1)
  const intro = useTransform(p, (v) => smooth(0, introEnd, v))
  const q = useTransform(p, (v) => clamp01((v - introEnd) / (1 - introEnd)))
  useMotionValueEvent(q, 'change', (v) => setActive(Math.min(n - 1, Math.floor(v * n * 0.999))))
  const local = useTransform(q, (v) => clamp01(v * n - 1))
  const headY = useTransform(intro, (t) => `${((1 - t) * 24).toFixed(2)}svh`)
  const headScale = useTransform(intro, (t) => 1 - t * 0.62)
  const chips = useTransform(intro, (t) => 1 - smooth(0, 0.45, t))
  const body = useTransform(intro, (t) => smooth(0.55, 1, t))
  const bodyY = useTransform(body, (t) => (1 - t) * 60)
  const graphics = [<IngestGraphic key="i" />, <NavigateGraphic key="n" local={local} />, <VerifyGraphic key="v" />, <WalkGraphic key="w" />]
  const step = STEPS[active]
  return (
    <section ref={ref} id="how" className="l-how t-butter" style={{ height: `${(n + 1) * 60 + 20}vh` }}>
      <div className="l-how__sticky">
        <motion.div className="l-how__intro" style={{ y: headY, scale: headScale }}>
          <div className="l-head__tags">
            <span className="tag">Mile 4</span>
            <span className="l-hero__chip">How it works</span>
          </div>
          <h2 className="display l-giant">From clone to clarity</h2>
          <motion.div className="l-how__chips" style={{ opacity: chips }}>
            {STEPS.map((s, i) => (
              <motion.span key={s.n} className="l-how__chip" initial={{ opacity: 0, y: 30, rotate: -6 }} whileInView={{ opacity: 1, y: 0, rotate: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.1 + i * 0.08 }}>
                <Shape kind={s.shape.kind} color={s.shape.color} glyph={s.shape.glyph} size={44} />
                <b>{s.n}</b> {s.title}
              </motion.span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div className="l-how__body" style={{ opacity: body, y: bodyY }}>
          <div className="l-how__stage">
            <AnimatePresence mode="wait">
              <motion.div key={active} className="l-how__step" initial="in" animate="on" exit="out">
                <motion.div className="l-how__shape" variants={{ in: { scale: 0, rotate: -40 }, on: { scale: 1, rotate: 0 }, out: { scale: 0, rotate: 40 } }} transition={{ type: 'spring', stiffness: 240, damping: 16 }}>
                  <Shape kind={step.shape.kind} color={step.shape.color} glyph={step.shape.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
                </motion.div>
                <span className="l-how__line">
                  <motion.span className="display l-how__title" variants={{ in: { y: '110%' }, on: { y: '0%' }, out: { y: '-110%' } }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
                    <span className="l-how__n">{step.n}</span> {step.title}
                  </motion.span>
                </span>
                <motion.p className="body" style={{ maxWidth: 500, color: 'var(--fg-soft)', marginTop: 16 }} variants={{ in: { opacity: 0, y: 20 }, on: { opacity: 1, y: 0 }, out: { opacity: 0 } }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}>
                  {step.text}
                </motion.p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="l-how__stage">
            <AnimatePresence mode="wait">
              <motion.div key={active} className="l-how__card" initial={{ opacity: 0, y: 60, rotate: 3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, y: -60, rotate: -3 }} transition={{ duration: 0.4, ease: [0.76, 0, 0.24, 1] }}>
                {graphics[active]}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="l-how__progress">
            {STEPS.map((s, i) => (
              <span key={s.n} className={`small${i === active ? ' is-on' : ''}`}>{s.n} {s.title}</span>
            ))}
            <div className="l-how__bar"><motion.div style={{ scaleX: q, originX: 0 }} /></div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/* ---------- Quote, inked as it scrolls ---------- */
export function Quote() {
  return (
    <section className="l-section t-cream">
      <div className="l-center" style={{ textAlign: 'left' }}>
        <ScrubText className="l-quote" text="“Jev decides. The LLM only writes. Code owns the control flow. Every claim is checked against the passage it cites, and when the evidence is thin, Trailhead says so instead of guessing.”" />
        <div className="l-quote__foot">
          <Mark size={52} animate={false} />
          <div>
            <div style={{ fontWeight: 800 }}>The Trailhead rulebook</div>
            <div className="small" style={{ opacity: 0.6 }}>Rule one of five</div>
          </div>
          <div className="l-quote__shapes">
            {STORY.slice(1, 4).map((s, i) => (
              <motion.div key={i} initial={{ scale: 0, rotate: -30 }} whileInView={{ scale: 1, rotate: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 240, damping: 14, delay: i * 0.1 }} whileHover={{ y: -10, rotate: 8 }}>
                <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={84} />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- Rules of the trail ---------- */
const RULES: [string, string, Glyph, string][] = [
  ['Repo text is data, never instructions', 'Every passage is screened for text aimed at an AI. It is escaped, delimited and never obeyed.', 'signal', 'var(--orange)'],
  ['No repository code is ever run', 'Trailhead clones and parses. It never installs, imports or executes what it reads.', 'file', 'var(--violet)'],
  ['Secrets stay home', '.env and secret-looking files are never sent to any model or service.', 'folder', 'var(--yellow)'],
  ['Every decision is on the record', 'Each Jev call is logged with its probabilities, cached on disk, and replayable offline.', 'check', 'var(--lime)'],
  ['It abstains instead of guessing', 'No verified claim that addresses the question means no answer. Thin evidence is labelled as thin.', 'flag', 'var(--blue)'],
]

export function Rules() {
  return (
    <section id="rules" className="l-section t-mint">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <Heading n="Mile 6" label="Guardrails">Rules of the trail</Heading>
        <ol className="l-rules">
          {RULES.map(([title, text, glyph, color], i) => (
            <motion.li key={title} initial={{ opacity: 0, x: -60 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7, delay: i * 0.04, ease: EASE }}>
              <motion.div className="l-rules__shape" initial={{ rotate: -90, scale: 0 }} whileInView={{ rotate: 0, scale: 1 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.15 }}>
                <Shape kind={i % 2 ? 'circle' : 'square'} color={color} glyph={glyph} size={64} />
              </motion.div>
              <div>
                <div className="chunk" style={{ fontSize: 'clamp(22px, 2.6vw, 36px)' }}>{title}</div>
                <p className="body" style={{ margin: '8px 0 0', color: 'var(--fg-soft)', maxWidth: 720 }}>{text}</p>
              </div>
              <span className="tag l-rules__n">0{i + 1}</span>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/* ---------- FAQ as a conversation ---------- */
const FAQ = [
  ['What is Jev?', 'Jev is TypeSafe’s decision model. It answers structured questions (yes/no, pick-one, rate-on-a-scale) with calibrated probabilities. Trailhead uses it for every judgment: routing, navigation, relevance, verification. The LLM only writes prose from what Jev has verified.'],
  ['Which repositories work?', 'Any public GitHub repository. Trailhead ingests the file tree, symbols (Python is parsed in depth), commits, pull requests, issues and review threads. The first ingest of a large project takes a while; after that everything is incremental and cached.'],
  ['Why is it sometimes slow?', 'The free Jev tier allows one request a minute, so a fresh question can take a few minutes. The dashboard shows exactly when the next request slot opens, and anything asked before comes back instantly from the cache.'],
  ['Will it make things up?', 'It is built not to. Claims must cite a passage, Jev checks each one against that passage, and the final prose is checked in code and by Jev for added facts. When nothing survives, it tells you it could not find a recorded answer.'],
  ['What happens to my data?', 'Your account and saved tours live in your own Supabase project behind row-level security. Repository analysis stays on the Trailhead server; secrets and .env files are never sent anywhere.'],
]

export function Faq() {
  const [open, setOpen] = useState<number>(0)
  return (
    <section id="faq" className="l-section t-peach">
      <Heading n="Mile 7" label="Ask away" center>Trail questions</Heading>
      <div className="l-chat">
        <div className="l-chat__qs">
          {FAQ.map(([q], i) => (
            <button key={q} className={`l-chat__q${open === i ? ' is-on' : ''}`} onClick={() => setOpen(i)} aria-pressed={open === i}>
              {q}
            </button>
          ))}
        </div>
        <div className="l-chat__thread" aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.div key={open} initial="in" animate="on" exit="out" style={{ display: 'grid', gap: 12 }}>
              <motion.div className="l-bubble is-me" variants={{ in: { opacity: 0, x: 40, scale: 0.9 }, on: { opacity: 1, x: 0, scale: 1 }, out: { opacity: 0, y: -20 } }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
                {FAQ[open][0]}
              </motion.div>
              <motion.div className="l-bubble is-typing" variants={{ in: { opacity: 0, scale: 0.6 }, on: { opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.6], height: [36, 36, 36, 0] }, out: { opacity: 0 } }} transition={{ duration: 0.9, times: [0, 0.2, 0.8, 1] }}>
                <span /><span /><span />
              </motion.div>
              <motion.div className="l-bubble" variants={{ in: { opacity: 0, y: 30, scale: 0.92 }, on: { opacity: 1, y: 0, scale: 1 }, out: { opacity: 0, y: -20 } }} transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.8 }}>
                <span className="l-bubble__who"><Mark size={22} animate={false} /> Trailhead</span>
                {FAQ[open][1]}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

/* ---------- Closing bento: call to action + footer ---------- */

export function Footer({ onJump }: { onJump: (id: string) => void }) {
  const signedIn = useSignedIn()
  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    onJump(id)
  }
  return (
    <div className="l-foot t-cream">
      <footer className="l-bento">
        <motion.div className="l-bento__cta" initial={{ opacity: 0, y: 60 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease: EASE }}>
          <SplitReveal as="h2" className="display l-bento__title" text="Ready to hit the trail?" />
          <p className="body" style={{ maxWidth: 440, margin: '14px 0 22px' }}>Sign in with GitHub or Google, pick a repository, and ask your first question.</p>
          <Link className="btn" to={signedIn ? '/app' : '/signup'}>
            <span>{signedIn ? 'Open your dashboard' : 'Create your account'}</span>
            <span className="arrow">→</span>
          </Link>
          <div className="l-bento__shapes" aria-hidden>
            {STORY.map((s, i) => (
              <motion.div key={i} initial={{ y: 120, rotate: -40 }} whileInView={{ y: 0, rotate: 0 }} viewport={{ once: true }} transition={{ type: 'spring', stiffness: 160, damping: 14, delay: 0.2 + i * 0.08 }}>
                <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
              </motion.div>
            ))}
          </div>
        </motion.div>
        <div className="l-bento__word">
          <span className="display">Trail</span>
          <span className="tag l-bento__tag">head</span>
        </div>
        <div className="l-bento__col">
          <div className="small" style={{ opacity: 0.6 }}>Product</div>
          <a href="#how" onClick={jump('how')}>How it works</a>
          <a href="#receipts" onClick={jump('receipts')}>Receipts</a>
          <a href="#rules" onClick={jump('rules')}>Guardrails</a>
          <a href="#faq" onClick={jump('faq')}>FAQ</a>
        </div>
        <div className="l-bento__col">
          <div className="small" style={{ opacity: 0.6 }}>Account</div>
          <Link to="/login">Log in</Link>
          <Link to="/signup">Sign up</Link>
          <Link to="/app">Dashboard</Link>
        </div>
        <div className="l-bento__col">
          <div className="small" style={{ opacity: 0.6 }}>Built on</div>
          <a href="https://github.com/scrapy/scrapy" target="_blank" rel="noreferrer">scrapy/scrapy</a>
          <span>Jev by TypeSafe</span>
          <span>Supabase</span>
        </div>
        <div className="l-bento__base small">
          <span>© {new Date().getFullYear()} Trailhead</span>
          <span>Jev decides · the LLM writes · code owns control flow</span>
        </div>
      </footer>
    </div>
  )
}
