import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Shape, type Glyph, type ShapeKind } from '../../motion/Shapes'
import { notify } from '../../lib/toast'
import { PALETTE } from '../viz'
import { Card, EASE, Gate, Loading, Note, PageHead, RefreshButton, useFetch } from '../ui'

type Summary = Record<string, number>
type Case = { id: string; attack: boolean; blocked: boolean; technique: string; kind: string; p?: number }
type Injection = { summary: Record<string, any>; cases: Case[] }
type WhyItem = { id: string; question: string; status: string; confidence?: number; claims: number; verified: number }
type EvalData = { nav: Record<string, Summary>; tour: Record<string, Summary>; why: Record<string, any>; injection?: Record<string, Injection>; why_items?: WhyItem[] }

const NAV_NAMES: Record<string, string> = { 'beam:jev': 'Jev beam search', 'greedy:jev': 'Jev greedy', bm25: 'BM25 over files', 'embed:nomic-embed-text': 'Embeddings (nomic)', 'grep_agent:llm': 'LLM grep agent' }
const TOUR_NAMES: Record<string, string> = { 'tour:jev': 'Trailhead tour (Jev)', bm25: 'BM25 on the issue text', history: 'Files of similar past changes' }
const KINDS: ShapeKind[] = ['tag', 'circle', 'square']
const GLYPHS: Glyph[] = ['grep', 'branch', 'folder', 'file', 'signal']

const BENCH = [
  { id: 'nav', label: 'Finding files', kind: 'square', color: 'var(--blue)', glyph: 'grep', cmd: 'bin/trailhead eval nav --report-only' },
  { id: 'tour', label: 'Guided tours', kind: 'circle', color: 'var(--green)', glyph: 'flag', cmd: 'bin/trailhead eval tour --report-only' },
  { id: 'injection', label: 'Hostile text', kind: 'tag', color: 'var(--orange)', glyph: 'signal', cmd: 'bin/trailhead eval injection --report-only' },
  { id: 'why', label: 'Why answers', kind: 'circle', color: 'var(--violet)', glyph: 'check', cmd: 'bin/trailhead eval why --report-only' },
] as const
type BenchId = (typeof BENCH)[number]['id']

const NAV_METRICS = [
  { key: 'mrr', label: 'MRR', plain: 'how high the right file ranks' },
  { key: 'acc_at_1', label: 'First try', plain: 'right file on the first try' },
  { key: 'hit_at_3', label: 'Top three', plain: 'right file among the top three' },
]
const TOUR_METRICS = [
  { key: 'recall@7', label: 'Within 7 stops', plain: 'files the real fix touched, within seven stops' },
  { key: 'recall@3', label: 'Within 3 stops', plain: 'files the real fix touched, within three stops' },
  { key: 'recall@1', label: 'First stop', plain: 'a touched file at the very first stop' },
  { key: 'mrr', label: 'MRR', plain: 'how early the first touched file shows up' },
]

const f3 = (n?: number) => (n == null ? '—' : n.toFixed(3).replace(/^0/, ''))
const pct = (n?: number) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const isJev = (name: string) => /jev|trailhead/i.test(name)

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => notify.ok('Copied', text),
    () => notify.error('Could not copy', 'Select the command and copy it by hand.'),
  )
}

function Command({ cmd }: { cmd: string }) {
  return (
    <button className="e-cmd" onClick={() => copy(cmd)} data-cursor="Copy">
      <span className="mono">{cmd}</span>
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
    </button>
  )
}

/** Each method walks its own trail; how far it gets is its score. */
function Race({ rows, metric, color }: { rows: [string, Summary][]; metric: string; color: string }) {
  const sorted = [...rows].sort((a, b) => (b[1][metric] ?? 0) - (a[1][metric] ?? 0))
  return (
    <div className="e-race">
      {sorted.map(([name, s], i) => {
        const v = Math.max(0, Math.min(1, s[metric] ?? 0))
        const tint = i === 0 ? color : PALETTE[(rows.findIndex(([n]) => n === name) + 3) % 6]
        return (
          <motion.div key={name} layout transition={{ type: 'spring', stiffness: 260, damping: 30 }} className={`e-lane ${i === 0 ? 'is-lead' : ''}`}>
            <span className="e-lane__name">
              <b>{name}</b>
              {isJev(name) && <span className="e-tag">Jev</span>}
              {i === 0 && <span className="e-tag is-lead">Leads</span>}
              <span className="e-lane__n">n = {s.n ?? '—'}</span>
            </span>
            <span className="e-lane__track">
              <motion.span className="e-lane__fill" style={{ background: tint }} initial={{ scaleX: 0 }} animate={{ scaleX: v }} transition={{ duration: 1.1, ease: EASE, delay: 0.1 + i * 0.07 }} />
              <motion.span className="e-lane__token" initial={{ left: '0%' }} animate={{ left: `${v * 100}%` }} transition={{ duration: 1.1, ease: EASE, delay: 0.1 + i * 0.07 }}>
                <Shape kind={KINDS[i % 3]} color={tint} glyph={GLYPHS[i % GLYPHS.length]} size={30} play={false} />
                <span className="e-lane__score mono">{f3(v)}</span>
              </motion.span>
            </span>
          </motion.div>
        )
      })}
      <div className="e-scale" aria-hidden>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => <span key={t} style={{ left: `${t * 100}%` }}>{t === 0 ? '0' : t === 1 ? '1' : f3(t)}</span>)}
      </div>
    </div>
  )
}

function Metrics({ items, on, set, color }: { items: { key: string; label: string }[]; on: string; set: (k: string) => void; color: string }) {
  return (
    <div className="e-metrics" role="tablist">
      {items.map((m) => (
        <button key={m.key} role="tab" aria-selected={m.key === on} className={m.key === on ? 'is-on' : ''} onClick={() => set(m.key)} style={{ ['--c' as string]: color }}>
          {m.key === on && <motion.span layoutId="e-metric" className="e-metrics__bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
          <span>{m.label}</span>
        </button>
      ))}
    </div>
  )
}

/** Full numbers, with the best value in each column picked out. */
function Table({ head, rows, cols }: { head: string[]; rows: [string, Summary][]; cols: { key: string; fmt: (s: Summary) => string; low?: boolean; plain?: boolean; val?: (s: Summary) => number }[] }) {
  const best = cols.map((c) => {
    if (c.plain) return null
    const vals = rows.map(([, s]) => (c.val ? c.val(s) : s[c.key])).filter((v) => typeof v === 'number') as number[]
    return vals.length ? (c.low ? Math.min(...vals) : Math.max(...vals)) : null
  })
  return (
    <div className="d-table-wrap">
      <table className="d-table e-table">
        <thead><tr><th>Method</th>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map(([n, s]) => (
            <tr key={n}>
              <td><b>{n}</b></td>
              {cols.map((c, i) => {
                const v = c.val ? c.val(s) : s[c.key]
                return <td key={c.key} className={best[i] != null && v === best[i] && rows.length > 1 ? 'is-best' : ''}>{c.fmt(s)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Quality against model tokens per question, every method labelled where it lands. Free methods sit on the left edge. */
function CostMap({ rows }: { rows: [string, Summary][] }) {
  const maxTok = Math.max(10, ...rows.map(([, s]) => s.mean_input_tokens ?? 0))
  const top = Math.ceil(Math.log10(maxTok))
  const ys = rows.map(([, s]) => s.mrr ?? 0)
  const lo = Math.max(0, Math.floor((Math.min(...ys) - 0.05) * 10) / 10)
  const hi = Math.min(1, Math.ceil((Math.max(...ys) + 0.03) * 10) / 10)
  const xOf = (t: number) => (t <= 0 ? 0 : 0.12 + 0.82 * (Math.log10(t) / top))
  const yOf = (v: number) => (v - lo) / Math.max(0.01, hi - lo)
  const ticks = Array.from({ length: top + 1 }, (_, i) => i).filter((i) => i >= 1)
  return (
    <div className="e-cost">
      <div className="e-cost__plot">
        <span className="e-cost__free">no model</span>
        {[lo, (lo + hi) / 2, hi].map((v) => <span key={v} className="e-cost__y" style={{ bottom: `${yOf(v) * 100}%` }}>{f3(v)}</span>)}
        {ticks.map((i) => <span key={i} className="e-cost__x" style={{ left: `${xOf(10 ** i) * 100}%` }}>{i >= 3 ? `${10 ** (i - 3)}k` : 10 ** i}</span>)}
        {rows.map(([n, s], i) => {
          const x = xOf(s.mean_input_tokens ?? 0)
          const y = yOf(s.mrr ?? 0)
          // Two labels that would collide split apart: the higher one lifts, the lower one drops.
          const near = rows.find(([m, o]) => m !== n && Math.abs(xOf(o.mean_input_tokens ?? 0) - x) < 0.3 && Math.abs(yOf(o.mrr ?? 0) - y) * 250 < 46)
          const nudge = near ? (yOf(near[1].mrr ?? 0) < y ? 'is-up' : 'is-down') : ''
          return (
            <motion.div key={n} className={`e-cost__pt ${x > 0.6 ? 'is-left' : ''} ${nudge}`} style={{ left: `${x * 100}%`, bottom: `${yOf(s.mrr ?? 0) * 100}%` }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 300, damping: 20 }}>
              <Shape kind={KINDS[i % 3]} color={PALETTE[i % 6]} glyph={GLYPHS[i % GLYPHS.length]} size={26} play={false} />
              <span className="e-cost__label"><b>{n}</b><span className="mono">{f3(s.mrr)} · {Math.round(s.mean_input_tokens ?? 0).toLocaleString()} tokens</span></span>
            </motion.div>
          )
        })}
      </div>
      <div className="e-cost__axes"><span>MRR ↑</span><span>model tokens per question (log) →</span></div>
    </div>
  )
}

function NavView({ nav }: { nav: [string, Summary][] }) {
  const [metric, setMetric] = useState('mrr')
  const m = NAV_METRICS.find((x) => x.key === metric)!
  const lead = [...nav].sort((a, b) => (b[1][metric] ?? 0) - (a[1][metric] ?? 0))[0]
  const free = nav.filter(([n]) => !isJev(n)).sort((a, b) => (b[1].acc_at_1 ?? 0) - (a[1].acc_at_1 ?? 0))[0]
  const jev = nav.filter(([n]) => isJev(n)).sort((a, b) => (b[1].acc_at_1 ?? 0) - (a[1].acc_at_1 ?? 0))[0]
  const slowest = Math.max(1, ...nav.map(([, s]) => s.mean_latency_ms ?? 0))
  return (
    <div className="d-bento">
      <Card span={8} title="Who finds the file first?" aside={<Metrics items={NAV_METRICS} on={metric} set={setMetric} color="var(--blue)" />}>
        <p className="e-lede">Hand-written “where is X handled?” questions, scored against the file a maintainer would point to. Showing <b>{m.plain}</b>.</p>
        <Race rows={nav} metric={metric} color="var(--blue)" />
      </Card>
      <Card span={4} title="In plain words" className="e-plain">
        {jev && (
          <p className="e-say">
            <b>{jev[0]}</b> opens the right file first <mark style={{ ['--c' as string]: 'var(--blue)' }}>{pct(jev[1].acc_at_1)}</mark> of the time, and has it in its top three <mark style={{ ['--c' as string]: 'var(--blue)' }}>{pct(jev[1].hit_at_3)}</mark>.
          </p>
        )}
        {free && <p className="e-say is-soft">The best method that needs no model, {free[0]}, gets it first {pct(free[1].acc_at_1)} of the time.</p>}
        {lead && <p className="d-muted small">Leading on this measure: {lead[0]}.</p>}
        <div className="e-plain__foot">
          <span className="d-muted small">Rebuild this table from the cache</span>
          <Command cmd={BENCH[0].cmd} />
        </div>
      </Card>
      {nav.length > 1 && (
        <Card span={7} title="What each answer costs" aside={<span className="d-muted small">higher and further left is better</span>}>
          <CostMap rows={nav} />
        </Card>
      )}
      <Card span={nav.length > 1 ? 5 : 12} title="Time per question">
        <div className="e-speed">
          {[...nav].sort((a, b) => (a[1].mean_latency_ms ?? 0) - (b[1].mean_latency_ms ?? 0)).map(([n, s], i) => (
            <div key={n} className="e-speed__row">
              <span className="e-speed__name">{n}</span>
              <span className="e-speed__track"><motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(2, ((s.mean_latency_ms ?? 0) / slowest) * 100)}%` }} transition={{ duration: 0.9, delay: 0.1 + i * 0.06, ease: EASE }} style={{ background: PALETTE[(i + 1) % 6] }} /></span>
              <span className="mono small">{((s.mean_latency_ms ?? 0) / 1000).toFixed(2)}s</span>
            </div>
          ))}
        </div>
        <p className="d-muted small" style={{ margin: '14px 0 0' }}>Jev rows cover fewer questions: the free tier answers about one request a minute, so those runs resume from the cache as slots open.</p>
      </Card>
      <Card span={12} title="Every number">
        <Table
          head={['n', 'First try', 'Top three', 'MRR', 'Requests', 'Tokens', 'Latency']}
          rows={nav}
          cols={[
            { key: 'n', fmt: (s) => String(s.n ?? '—'), plain: true },
            { key: 'acc_at_1', fmt: (s) => f3(s.acc_at_1) },
            { key: 'hit_at_3', fmt: (s) => f3(s.hit_at_3) },
            { key: 'mrr', fmt: (s) => f3(s.mrr) },
            { key: 'mean_requests', fmt: (s) => (s.mean_requests ?? 0).toFixed(1), low: true },
            { key: 'mean_input_tokens', fmt: (s) => Math.round(s.mean_input_tokens ?? 0).toLocaleString(), low: true },
            { key: 'mean_latency_ms', fmt: (s) => `${((s.mean_latency_ms ?? 0) / 1000).toFixed(2)}s`, low: true },
          ]}
        />
      </Card>
    </div>
  )
}

function TourView({ tour }: { tour: [string, Summary][] }) {
  const [metric, setMetric] = useState('recall@7')
  const m = TOUR_METRICS.find((x) => x.key === metric)!
  const jev = tour.find(([n]) => isJev(n))
  const free = tour.filter(([n]) => !isJev(n)).sort((a, b) => (b[1]['recall@7'] ?? 0) - (a[1]['recall@7'] ?? 0))[0]
  return (
    <div className="d-bento">
      <Card span={8} title="Whose tour walks past the fix?" aside={<Metrics items={TOUR_METRICS} on={metric} set={setMetric} color="var(--green)" />}>
        <p className="e-lede">Closed good-first issues with the fixing pull request hidden. A tour scores when the files that pull request touched show up among its stops. Showing <b>{m.plain}</b>.</p>
        <Race rows={tour} metric={metric} color="var(--green)" />
      </Card>
      <Card span={4} title="In plain words" className="e-plain">
        {jev && (
          <p className="e-say">
            Within seven stops, <b>{jev[0]}</b> covers <mark style={{ ['--c' as string]: 'var(--green)' }}>{pct(jev[1]['recall@7'])}</mark> of the files the real fix changed.
          </p>
        )}
        {free && jev && <p className="e-say is-soft">The best tour without a model, {free[0].toLowerCase()}, covers {pct(free[1]['recall@7'])}.</p>}
        <div className="e-plain__foot">
          <span className="d-muted small">Rebuild this table from the cache</span>
          <Command cmd={BENCH[1].cmd} />
        </div>
      </Card>
      <Card span={12} title="Every number">
        <Table
          head={['n', 'First stop', 'Within 3', 'Within 7', 'MRR', 'Requests']}
          rows={tour}
          cols={[
            { key: 'n', fmt: (s) => String(s.n ?? '—'), plain: true },
            { key: 'recall@1', fmt: (s) => f3(s['recall@1']) },
            { key: 'recall@3', fmt: (s) => f3(s['recall@3']) },
            { key: 'recall@7', fmt: (s) => f3(s['recall@7']) },
            { key: 'mrr', fmt: (s) => f3(s.mrr) },
            { key: 'requests', fmt: (s) => (s.requests ?? 0).toFixed(1), low: true },
          ]}
        />
      </Card>
    </div>
  )
}

/** Every passage in the suite as a tile: attacks should end up blocked, look-alikes should pass. */
function Wall({ name, data, delay }: { name: string; data: Injection; delay: number }) {
  const attacks = data.cases.filter((c) => c.attack)
  const benign = data.cases.filter((c) => !c.attack)
  const caught = attacks.filter((c) => c.blocked).length
  const falseBlocks = benign.filter((c) => c.blocked).length
  const s = data.summary
  const tile = (c: Case, i: number) => {
    const good = c.attack === c.blocked
    return (
      <motion.span
        key={c.id}
        className={`e-tile ${c.attack ? 'is-attack' : 'is-benign'} ${good ? 'is-good' : 'is-bad'}`}
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: delay + i * 0.025, type: 'spring', stiffness: 380, damping: 18 }}
        data-cursor={`${c.technique || c.id} · ${c.attack ? (c.blocked ? 'caught' : 'slipped through') : c.blocked ? 'wrongly blocked' : 'let through'}`}
      >
        {c.attack ? (c.blocked ? '✕' : '!') : c.blocked ? '!' : ''}
      </motion.span>
    )
  }
  return (
    <Card span={6} title={name} delay={delay}>
      <p className="e-say">
        Caught <mark style={{ ['--c' as string]: 'var(--orange)' }}>{caught} of {attacks.length}</mark> attacks and wrongly blocked <mark style={{ ['--c' as string]: 'var(--green)' }}>{falseBlocks} of {benign.length}</mark> harmless look-alikes.
      </p>
      <div className="e-wall">
        <span className="e-wall__label">Attacks</span>
        <div className="e-wall__tiles">{attacks.map(tile)}</div>
        <span className="e-wall__label">Look-alikes</span>
        <div className="e-wall__tiles">{benign.map((c, i) => tile(c, i + attacks.length))}</div>
      </div>
      {typeof s.guard_block_rate === 'number' && (
        <p className="d-muted small" style={{ margin: '16px 0 0' }}>
          Output guard: stopped {pct(s.guard_block_rate)} of bad answers across {s.guard_cases ?? '—'} cases{typeof s.guard_false_block_rate === 'number' ? `, and held back ${pct(s.guard_false_block_rate)} of good ones` : ''}.
        </p>
      )}
    </Card>
  )
}

function InjectionView({ inj }: { inj?: Record<string, Injection> }) {
  if (!inj || Object.keys(inj).length === 0) return <Note>No prompt-injection results yet. Run <span className="mono">bin/trailhead eval injection</span>, or restart the API if you just updated Trailhead.</Note>
  return (
    <div className="d-bento">
      <Card span={12} className="e-intro">
        <p className="e-lede" style={{ margin: 0 }}>
          Repository text can try to steer the model. The suite mixes 16 attack passages (overrides, fake delimiters, encoded payloads, hidden markup) with 10 harmless passages that only look like attacks. Each tile below is one passage.
        </p>
        <div className="e-legend">
          <span><i className="e-tile is-attack is-good">✕</i>attack caught</span>
          <span><i className="e-tile is-attack is-bad">!</i>attack missed</span>
          <span><i className="e-tile is-benign is-good" />look-alike let through</span>
          <span><i className="e-tile is-benign is-bad">!</i>look-alike blocked</span>
        </div>
      </Card>
      {inj.jev && <Wall name="Jev screening" data={inj.jev} delay={0.05} />}
      {inj.llm && <Wall name="LLM screening" data={inj.llm} delay={0.12} />}
      <Card span={12} title="Rebuild it">
        <Command cmd={BENCH[2].cmd} />
      </Card>
    </div>
  )
}

function WhyView({ items, why }: { items?: WhyItem[]; why: Record<string, any> }) {
  const labelled = (why?.label_sources?.human ?? 0) + (why?.label_sources?.provisional ?? 0) > 0
  const steps = [
    { title: 'Answer the questions', text: 'Runs the why-questions through Jev and records every claim.', cmd: 'bin/trailhead eval why' },
    { title: 'Label the claims', text: 'Mark each claim supported or not in the CSV.', cmd: 'eval/why_claim_labels.csv' },
    { title: 'Draw the calibration', text: 'Builds the reliability diagram and the calibration error.', cmd: 'bin/trailhead eval why --report-only' },
  ]
  return (
    <div className="d-bento">
      <Card span={7} title="Questions answered so far">
        {!items || items.length === 0 ? (
          <p className="d-muted">No why-questions have been run yet.</p>
        ) : (
          <div className="e-whys">
            {items.map((q, i) => (
              <motion.div key={q.id} className="e-why" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.07, ease: EASE }}>
                <Shape kind={KINDS[i % 3]} color={PALETTE[i % 6]} glyph="check" size={28} play={false} />
                <div className="e-why__body">
                  <b>{q.question || q.id}</b>
                  <span className="d-muted small">
                    {q.status === 'abstained' ? 'Held back: the record was too thin' : `${q.verified} of ${q.claims} claim${q.claims === 1 ? '' : 's'} checked against evidence`}
                  </span>
                </div>
                {typeof q.confidence === 'number' && (
                  <span className="e-why__conf" title="Confidence">
                    <svg width={38} height={38} viewBox="0 0 38 38" aria-hidden>
                      <circle cx={19} cy={19} r={15} fill="none" stroke="var(--chip)" strokeWidth={5} />
                      <motion.circle cx={19} cy={19} r={15} fill="none" stroke={PALETTE[i % 6]} strokeWidth={5} strokeLinecap="round" transform="rotate(-90 19 19)" initial={{ pathLength: 0 }} animate={{ pathLength: q.confidence }} transition={{ duration: 1, delay: 0.2 + i * 0.07, ease: EASE }} />
                    </svg>
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </Card>
      <Card span={5} title={labelled ? 'Calibration' : 'Calibration needs labels'}>
        {labelled ? (
          <div className="d-kv is-grid">
            <div><dt>Claims scored</dt><dd className="mono">{why.claims?.n ?? 0}</dd></div>
            <div><dt>Calibration error</dt><dd className="mono">{f3(why.claims?.ece)}</dd></div>
            <div><dt>Precision of shown claims</dt><dd className="mono">{f3(why.claims?.precision_of_shown_claims)}</dd></div>
            <div><dt>Abstention rate</dt><dd className="mono">{pct(why.answers?.abstention_rate)}</dd></div>
          </div>
        ) : (
          <ol className="e-steps">
            {steps.map((st, i) => (
              <motion.li key={st.title} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.1, ease: EASE }}>
                <span className="e-steps__dot">{i + 1}</span>
                <div>
                  <b>{st.title}</b>
                  <p className="d-muted small">{st.text}</p>
                  <Command cmd={st.cmd} />
                </div>
              </motion.li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  )
}

export default function Evals() {
  const { data, error, loading, reloading, reload } = useFetch<EvalData>('/api/evals')
  const [bench, setBench] = useState<BenchId>(() => (BENCH.find((b) => `#${b.id}` === window.location.hash)?.id ?? 'nav'))
  const nav = useMemo(() => Object.entries(data?.nav ?? {}).map(([k, s]) => [NAV_NAMES[k] ?? k, s] as [string, Summary]).sort((a, b) => (b[1].mrr ?? 0) - (a[1].mrr ?? 0)), [data])
  const tour = useMemo(() => Object.entries(data?.tour ?? {}).map(([k, s]) => [TOUR_NAMES[k] ?? k, s] as [string, Summary]).sort((a, b) => (b[1]['recall@7'] ?? 0) - (a[1]['recall@7'] ?? 0)), [data])
  const pick = (id: BenchId) => {
    setBench(id)
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="d-body">
      <PageHead kicker="Receipts" title="Measured," oblique="not claimed" note="Every number replays from cached calls, so you can rebuild any of it on your own machine." actions={<RefreshButton busy={reloading} onClick={reload} />}>
        <div className="e-bench" role="tablist" aria-label="Benchmarks">
          {BENCH.map((b) => (
            <button key={b.id} role="tab" aria-selected={b.id === bench} className={`e-bench__btn ${b.id === bench ? 'is-on' : ''}`} onClick={() => pick(b.id)}>
              {b.id === bench && <motion.span layoutId="e-bench" className="e-bench__bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
              <span className="e-bench__icon"><Shape kind={b.kind} color={b.color} glyph={b.glyph} size={24} play={b.id === bench} /></span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </PageHead>
      <Gate needsRepo={false} />
      {error && <Note tone="error">{error}</Note>}
      {loading && !data && <Loading label="Counting" />}
      {data && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={bench} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE }}>
            {bench === 'nav' && (nav.length ? <NavView nav={nav} /> : <Note>No navigation results yet. Run <span className="mono">bin/trailhead eval nav</span>.</Note>)}
            {bench === 'tour' && (tour.length ? <TourView tour={tour} /> : <Note>No tour results yet. Run <span className="mono">bin/trailhead eval tour</span>.</Note>)}
            {bench === 'injection' && <InjectionView inj={data.injection} />}
            {bench === 'why' && <WhyView items={data.why_items} why={data.why} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
