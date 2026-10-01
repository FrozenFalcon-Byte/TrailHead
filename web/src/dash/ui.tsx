import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, stream } from '../lib/api'
import type { BeamStep } from '../motion/BeamColumns'
import { Shape, STORY } from '../motion/Shapes'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailSpinner } from '../motion/TrailSpinner'
import { Link } from 'react-router-dom'
import { useDash } from './context'

export const EASE = [0.22, 1, 0.36, 1] as const
export type Theme = 'cream' | 'peach' | 'lilac' | 'mint' | 'butter' | 'sky' | 'lime'

// Which story shape leads each page header, by backdrop.
const HEAD_STORY: Record<Theme, number> = { cream: 0, lilac: 0, sky: 4, mint: 1, peach: 2, butter: 3, lime: 1 }

/** Pastel page header, like a landing mile: an arrow tag, heavy display type with a lime highlight, and a
 *  small cluster of story shapes that pop in and drift. */
export function PageHead({ theme, kicker, title, oblique, note, children }: { theme: Theme; kicker: string; title: string; oblique?: string; note?: string; children?: ReactNode }) {
  const k = HEAD_STORY[theme]
  const trio = [STORY[k], STORY[(k + 2) % STORY.length], STORY[(k + 4) % STORY.length]]
  return (
    <header className={`d-head t-${theme}`}>
      <div className="d-head__copy">
        <motion.span className="tag" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}>
          {kicker}
        </motion.span>
        <h1 className="display d-head__title">
          <SplitReveal text={title} immediate delay={0.12} />
          {oblique && (
            <>
              {' '}
              <motion.span className="d-hl" initial={{ clipPath: 'inset(0 100% 0 0 round 0.16em)' }} animate={{ clipPath: 'inset(0 0% 0 0 round 0.16em)' }} transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.3 }}>
                {oblique}
              </motion.span>
            </>
          )}
        </h1>
        {note && (
          <motion.p className="body d-head__note" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.6, ease: EASE }}>
            {note}
          </motion.p>
        )}
        {children}
      </div>
      <div className="d-head__art" aria-hidden>
        {trio.map((st, i) => (
          <motion.div key={i} className={`d-head__shape is-${i}`} initial={{ scale: 0, rotate: -50 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 13, delay: 0.2 + i * 0.12 }}>
            <motion.div animate={{ y: [0, i % 2 ? 8 : -10, 0], rotate: [0, i % 2 ? -6 : 6, 0] }} transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut' }}>
              <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
            </motion.div>
          </motion.div>
        ))}
      </div>
    </header>
  )
}

export function Stat({ label, value, theme = 'cream', i = 0 }: { label: string; value: ReactNode; theme?: Theme; i?: number }) {
  return (
    <motion.div className={`d-stat t-${theme}`} initial={{ opacity: 0, y: 24, rotate: i % 2 ? 1.5 : -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.06 }} whileHover={{ y: -4, rotate: i % 2 ? -1 : 1 }}>
      <span className="v">{value}</span>
      <span className="small" style={{ opacity: 0.8 }}>{label}</span>
    </motion.div>
  )
}

export function Card({ children, title, aside, theme, style, delay = 0 }: { children: ReactNode; title?: ReactNode; aside?: ReactNode; theme?: Theme; style?: React.CSSProperties; delay?: number }) {
  return (
    <motion.section className={`d-card ${theme ? `tinted t-${theme}` : ''}`} style={style} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay }}>
      {(title || aside) && (
        <div className="d-row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          {title && <h3 className="chunk" style={{ fontSize: 24 }}>{title}</h3>}
          {aside}
        </div>
      )}
      {children}
    </motion.section>
  )
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const styles = { info: { background: 'var(--chip)', color: 'var(--ink)' }, error: { background: 'color-mix(in srgb, var(--stop) 14%, var(--surface))', color: 'var(--stop)' }, ok: { background: 'var(--lime)', color: 'var(--solid)' } }[tone]
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ ...styles, borderRadius: 14, padding: '12px 16px', fontWeight: 600, fontSize: 14.5, lineHeight: 1.4 }} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </motion.div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 16px', display: 'grid', justifyItems: 'center', gap: 10 }}>
      <svg width={120} height={60} viewBox="0 0 120 60" aria-hidden>
        <motion.path d="M4 50 C 30 50, 30 14, 60 14 S 90 50, 116 50" fill="none" stroke="currentColor" strokeWidth={3} strokeDasharray="2 8" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE }} />
        <motion.circle cx={60} cy={12} r={9} fill="var(--orange)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: 'spring' }} />
      </svg>
      <div className="chunk" style={{ fontSize: 26 }}>{title}</div>
      {children && <div className="body" style={{ maxWidth: 520, opacity: 0.75 }}>{children}</div>}
    </div>
  )
}

/** Probability bar that grows in. */
export function Prob({ p, color = 'var(--orange)', width = 90 }: { p: number; color?: string; width?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width, height: 6, borderRadius: 3, background: 'color-mix(in srgb, currentColor 14%, transparent)', overflow: 'hidden', display: 'inline-block' }}>
        <motion.span initial={{ scaleX: 0 }} animate={{ scaleX: Math.max(0.02, p) }} transition={{ duration: 0.8, ease: EASE }} style={{ display: 'block', height: '100%', background: color, transformOrigin: 'left' }} />
      </span>
      <span className="small mono">{p.toFixed(2)}</span>
    </span>
  )
}

export function CalibBadge({ badge, status }: { badge?: string; status?: string }) {
  const tone = status === 'dropped' ? ['var(--dim)', 'var(--ink)'] : badge === 'high' ? ['var(--lime)', 'var(--solid)'] : badge === 'medium' ? ['var(--blue)', 'var(--on-solid)'] : ['var(--orange)', 'var(--solid)']
  return (
    <span className="d-badge" style={{ background: tone[0], color: tone[1] }}>
      {status === 'dropped' ? 'dropped' : status === 'flagged' ? 'flagged' : badge || status}
    </span>
  )
}

/** Countdown to the next Jev request slot, drawn as a filling blaze. The free tier gives about one request a minute. */
export function SlotMeter() {
  const { nextSlot, offline, engine } = useDash()
  const ready = nextSlot < 0.5
  const frac = Math.min(1, nextSlot / 65)
  return (
    <div style={{ borderRadius: 14, padding: '12px 14px', background: 'color-mix(in srgb, var(--fg) 9%, transparent)' }} title="Jev on the free tier answers about one request per minute; cached decisions are instant.">
      <div className="d-row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span className="small" style={{ fontWeight: 750 }}>{offline ? 'API offline' : engine === 'jev' ? 'Jev slot' : `${engine} engine`}</span>
        <span className="small mono">{offline ? '—' : engine !== 'jev' ? 'ready' : ready ? 'ready' : `${Math.ceil(nextSlot)}s`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, marginTop: 8, overflow: 'hidden', background: 'color-mix(in srgb, var(--fg) 16%, transparent)' }}>
        <motion.div animate={{ scaleX: offline ? 0 : ready || engine !== 'jev' ? 1 : 1 - frac, background: ready ? 'var(--lime)' : 'var(--orange)' }} transition={{ duration: 0.5, ease: 'linear' }} style={{ height: '100%', transformOrigin: 'left' }} />
      </div>
    </div>
  )
}

/** Navigation steps from the API, in the shape the beam columns draw. */
export function toBeamSteps(steps: { node: string; depth?: number; options: { id?: string; name: string; kind?: string; probability: number }[]; none_probability?: number | null }[]): BeamStep[] {
  return steps.map((s) => ({
    node: s.node,
    depth: s.depth,
    none: s.none_probability ?? undefined,
    options: [...s.options].sort((a, b) => b.probability - a.probability).map((o) => ({ name: o.name, p: o.probability, kind: o.kind })),
  }))
}

type EvidenceLike = { label?: string; ref: string; url?: string; title?: string }

/** Small, safe renderer for model prose: paragraphs, bullet lines, `code`, **bold**, and [E#] citations as links.
 *  Everything becomes React text nodes; nothing from the model is parsed as HTML. */
export function Prose({ text, evidence = [] }: { text: string; evidence?: EvidenceLike[] }) {
  const byLabel = new Map(evidence.filter((e) => e.label).map((e) => [e.label as string, e]))
  const inline = (line: string, key: string) =>
    line.split(/(`[^`]+`|\*\*[^*]+\*\*|\[E\d+(?:\s*,\s*E\d+)*\])/g).map((part, i) => {
      if (!part) return null
      if (part.startsWith('`')) return <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>
      if (part.startsWith('**')) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      if (/^\[E\d/.test(part))
        return (
          <sup key={`${key}-${i}`} style={{ whiteSpace: 'nowrap' }}>
            {part.slice(1, -1).split(/\s*,\s*/).map((label) => {
              const e = byLabel.get(label)
              return (
                <a key={label} href={e?.url || undefined} target="_blank" rel="noreferrer noopener" title={e ? `${e.ref} — ${e.title ?? ''}` : label} style={{ margin: '0 2px', padding: '1px 5px', borderRadius: 5, background: 'var(--orange)', color: 'var(--solid)', textDecoration: 'none', fontWeight: 800, fontSize: 11 }}>
                  {label}
                </a>
              )
            })}
          </sup>
        )
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>
    })
  const blocks = text.split(/\n{2,}/)
  return (
    <div className="d-md body">
      {blocks.map((block, b) => {
        const lines = block.split('\n')
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={b} style={{ margin: '0 0 0.7em', paddingLeft: 20 }}>
              {lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ''), `${b}-${i}`)}</li>)}
            </ul>
          )
        return <p key={b}>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l, `${b}-${i}`)}</Fragment>)}</p>
      })}
    </div>
  )
}

export type StreamState<T> = { running: boolean; events: { kind: string; data: any }[]; result: T | null; error: string; elapsed: number }

/** Runs one SSE job from the API and keeps the slot meter honest from its heartbeats. */
export function useJob<T>(path: string) {
  const { noteSlot } = useDash()
  const [state, setState] = useState<StreamState<T>>({ running: false, events: [], result: null, error: '', elapsed: 0 })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const start = useCallback(
    async (body: unknown, onEvent?: (kind: string, data: any) => void) => {
      abort.current?.abort()
      const ctrl = new AbortController()
      abort.current = ctrl
      setState({ running: true, events: [], result: null, error: '', elapsed: 0 })
      try {
        await stream(
          path,
          body,
          ({ kind, data }) => {
            if (kind === 'heartbeat') {
              noteSlot(data.next_slot_s ?? 0)
              setState((s) => ({ ...s, elapsed: data.elapsed ?? s.elapsed }))
              return
            }
            onEvent?.(kind, data)
            setState((s) => ({
              ...s,
              events: kind === 'done' || kind === 'error' ? s.events : [...s.events, { kind, data }],
              result: kind === 'done' ? (data as T) : s.result,
              error: kind === 'error' ? data.message : s.error,
              running: kind === 'done' || kind === 'error' ? false : s.running,
            }))
          },
          ctrl.signal,
        )
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }))
      } finally {
        setState((s) => ({ ...s, running: false }))
      }
    },
    [path, noteSlot],
  )
  const cancel = useCallback(() => {
    abort.current?.abort()
    setState((s) => ({ ...s, running: false }))
  }, [])
  const reset = useCallback((result: T | null = null) => setState({ running: false, events: [], result, error: '', elapsed: 0 }), [])
  return { ...state, start, cancel, reset }
}

/** Status line while a job runs: what stage it is at, how long, and why it may be waiting. */
export function JobStatus({ running, stage, elapsed, onCancel }: { running: boolean; stage: string; elapsed: number; onCancel?: () => void }) {
  const { nextSlot, engine } = useDash()
  return (
    <AnimatePresence>
      {running && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
          <div className="d-row" style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--solid)', color: 'var(--on-solid)', boxShadow: 'inset 0 0 0 1.5px var(--line)' }}>
            <TrailSpinner label={stage} />
            <span className="small" style={{ opacity: 0.8 }}>
              {Math.round(elapsed)}s{engine === 'jev' && nextSlot > 1 ? ` · waiting ${Math.ceil(nextSlot)}s for the next Jev slot` : ''}
            </span>
            {onCancel && (
              <button className="d-chip" onClick={onCancel} style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--lime)', boxShadow: 'inset 0 0 0 1.5px var(--lime)' }}>
                Stop
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString()
}

/** GET with loading and error state; refetches when the path changes. */
export function useFetch<T>(path: string | null) {
  // While the API is down the Gate panel explains it; a raw "Failed to fetch" on top would only add noise.
  const { offline } = useDash()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let alive = true
    setLoading(true)
    setError('')
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [path, tick])
  return { data, error: offline ? '' : error, loading, reload: () => setTick((t) => t + 1) }
}

export function Loading({ label = 'Walking over' }: { label?: string }) {
  return (
    <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}>
      <TrailSpinner label={label} />
    </div>
  )
}

export const q = (repo: string) => (repo ? `repo=${encodeURIComponent(repo)}` : '')

/** What a page needs before it can do anything: the API running and, usually, an ingested repository.
 *  Renders nothing when both are there; otherwise one clear panel with the next step. */
export function Gate({ needsRepo = true }: { needsRepo?: boolean }) {
  const { offline, repo, recheck } = useDash()
  const [checking, setChecking] = useState(false)
  const [copied, setCopied] = useState(false)
  if (!offline && (repo || !needsRepo)) return null
  const cmd = 'bin/trailhead serve'
  const copy = () => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    }, () => undefined)
  }
  const retry = async () => {
    setChecking(true)
    await recheck()
    setChecking(false)
  }
  return (
    <motion.section className={`d-gate ${offline ? 't-peach' : 't-mint'}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}>
      <div className="d-gate__art" aria-hidden>
        <Shape kind={offline ? 'tag' : 'square'} color={offline ? 'var(--orange)' : 'var(--green)'} glyph={offline ? 'signal' : 'folder'} size={0} style={{ width: '100%', height: 'auto' }} />
        <motion.span className="d-gate__pulse" style={{ background: offline ? 'var(--orange)' : 'var(--green)' }} animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
      </div>
      <div className="d-gate__copy">
        <h2 className="chunk">{offline ? 'The Trailhead API is not running' : 'No repository yet'}</h2>
        <p className="body">
          {offline
            ? 'Everything here is computed by the local API. Start it from the project folder, then check again.'
            : 'Ingest one first. It reads code, commits, pull requests and issues, and never runs the code.'}
        </p>
        <div className="d-row">
          {offline ? (
            <>
              <button className="d-gate__cmd mono" onClick={copy} title="Copy the command">
                <span>$ {cmd}</span>
                <b>{copied ? 'copied' : 'copy'}</b>
              </button>
              <button className="btn small" onClick={retry} disabled={checking} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}>
                <span>{checking ? 'Checking…' : 'Check again'}</span>
                <span className="arrow">↻</span>
              </button>
            </>
          ) : (
            <Link to="/app/repos" className="btn small" style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}>
              <span>Add a repository</span>
              <span className="arrow">→</span>
            </Link>
          )}
        </div>
      </div>
    </motion.section>
  )
}
