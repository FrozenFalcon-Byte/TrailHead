import { motion } from 'motion/react'
import { Card, EASE, Gate, Loading, Note, PageHead, useFetch } from '../ui'

type Summary = Record<string, number>
type EvalData = { nav: Record<string, Summary>; tour: Record<string, Summary>; why: Record<string, any> }

const NAV_NAMES: Record<string, string> = { 'beam:jev': 'Jev beam search', 'greedy:jev': 'Jev greedy', bm25: 'BM25 over files', 'embed:nomic-embed-text': 'Embeddings (nomic)', 'grep_agent:llm': 'LLM grep agent' }
const TOUR_NAMES: Record<string, string> = { 'tour:jev': 'Trailhead tour (Jev)', bm25: 'BM25 on the issue text', history: 'Files of similar past changes' }

function Bars({ rows, metric, color }: { rows: [string, Summary][]; metric: string; color: string }) {
  const max = Math.max(...rows.map(([, s]) => s[metric] ?? 0), 0.01)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map(([name, s], i) => (
        <div key={name} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr auto', gap: 12, alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>{name}</span>
          <div style={{ height: 22, borderRadius: 6, background: 'color-mix(in srgb, currentColor 10%, transparent)', overflow: 'hidden' }}>
            <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: (s[metric] ?? 0) / max }} viewport={{ once: true }} transition={{ duration: 1, delay: i * 0.08, ease: EASE }} style={{ height: '100%', background: i === 0 ? 'var(--orange)' : color, transformOrigin: 'left' }} />
          </div>
          <span className="display" style={{ fontSize: 26 }}>{(s[metric] ?? 0).toFixed(3)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Evals() {
  const { data, error, loading } = useFetch<EvalData>('/api/evals')
  const nav = Object.entries(data?.nav ?? {}).map(([k, s]) => [NAV_NAMES[k] ?? k, s] as [string, Summary]).sort((a, b) => (b[1].mrr ?? 0) - (a[1].mrr ?? 0))
  const tour = Object.entries(data?.tour ?? {}).map(([k, s]) => [TOUR_NAMES[k] ?? k, s] as [string, Summary]).sort((a, b) => (b[1].mrr ?? 0) - (a[1].mrr ?? 0))
  const why = data?.why ?? {}

  return (
    <>
      <PageHead theme="sky" kicker="Receipts" title="Measured," oblique="not claimed" note="every number replays from cached calls with one command: bin/trailhead eval …" />
      <div className="d-body">
        <Gate needsRepo={false} />
        {error && <Note tone="error">{error}</Note>}
        {loading && !data && <Loading label="Counting" />}
        {data && (
          <>
            <Card title="Navigation · mean reciprocal rank" aside={<span className="small" style={{ opacity: 0.6 }}>find the file a past fix touched</span>}>
              <Bars rows={nav} metric="mrr" color="var(--orange)" />
              <table className="d-table" style={{ marginTop: 18 }}>
                <thead><tr><th>Method</th><th>n</th><th>Acc@1</th><th>Hit@3</th><th>Requests</th><th>Tokens</th><th>Latency</th></tr></thead>
                <tbody>{nav.map(([n, s]) => <tr key={n}><td>{n}</td><td>{s.n}</td><td>{s.acc_at_1?.toFixed(3)}</td><td>{s.hit_at_3?.toFixed(3)}</td><td>{s.mean_requests?.toFixed(1)}</td><td>{Math.round(s.mean_input_tokens ?? 0).toLocaleString()}</td><td>{((s.mean_latency_ms ?? 0) / 1000).toFixed(2)}s</td></tr>)}</tbody>
              </table>
            </Card>
            <Card title="Tours · recall of the files the real fix changed" aside={<span className="small" style={{ opacity: 0.6 }}>closed good-first issues, planned as of the day they were opened</span>}>
              <Bars rows={tour} metric="recall@7" color="var(--green)" />
              <table className="d-table" style={{ marginTop: 18 }}>
                <thead><tr><th>Method</th><th>n</th><th>R@1</th><th>R@3</th><th>R@7</th><th>MRR</th><th>Requests</th></tr></thead>
                <tbody>{tour.map(([n, s]) => <tr key={n}><td>{n}</td><td>{s.n}</td><td>{s['recall@1']?.toFixed(3)}</td><td>{s['recall@3']?.toFixed(3)}</td><td>{s['recall@7']?.toFixed(3)}</td><td>{s.mrr?.toFixed(3)}</td><td>{s.requests?.toFixed(1)}</td></tr>)}</tbody>
              </table>
            </Card>
            <Card title="Why-questions · calibration" theme="peach">
              {Object.keys(why).length === 0 ? (
                <p className="body" style={{ margin: 0 }}>Waiting on labels. Run <span className="mono">bin/trailhead eval why</span>, label <span className="mono">eval/why_claim_labels.csv</span>, then <span className="mono">bin/trailhead eval why --report-only</span> for the reliability diagram and ECE.</p>
              ) : (
                <div className="d-grid">
                  {Object.entries(why).filter(([, v]) => typeof v === 'number').map(([k, v]) => (
                    <div key={k}><div className="display" style={{ fontSize: 44 }}>{(v as number).toFixed(3)}</div><div className="small">{k.replace(/_/g, ' ')}</div></div>
                  ))}
                </div>
              )}
            </Card>
            <p className="small" style={{ opacity: 0.55 }}>Small n on Jev rows: the free tier answers about one request a minute, so those runs resume from the cache as slots allow. Baselines run on the full set.</p>
          </>
        )}
      </div>
    </>
  )
}
