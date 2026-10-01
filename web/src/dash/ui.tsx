import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, stream } from '../lib/api'
import type { BeamStep } from '../motion/BeamColumns'
import { Contours } from '../motion/Contours'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailSpinner } from '../motion/TrailSpinner'
import { useDash } from './context'

export const EASE = [0.22, 1, 0.36, 1] as const
export type Theme = 'pine' | 'paper' | 'bark' | 'glacier' | 'plum'

/** Colour-blocked page header: giant condensed caps, a hand-written note, and moving contour lines. */
export function PageHead({ theme, kicker, title, oblique, note, children }: { theme: Theme; kicker: string; title: string; oblique?: string; note?: string; children?: ReactNode }) {
  return (
    <header className={`d-head t-${theme}`}>
      <Contours color="var(--fg)" opacity={0.1} rings={8} />
      <div style={{ position: 'relative' }}>
        <motion.div className="kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.1 }} style={{ marginBottom: 14, opacity: 0.8 }}>
          {kicker}
        </motion.div>
        <h1 className="display">
          <SplitReveal text={title} immediate delay={0.12} />
          {oblique && (
            <>
              {' '}
              <span className="oblique" style={{ color: 'var(--blaze)' }}>
                <SplitReveal text={oblique} immediate delay={0.25} />
              </span>
            </>
          )}
        </h1>
        {note && (
          <motion.p className="hand" initial={{ opacity: 0, rotate: -4, x: -10 }} animate={{ opacity: 1, rotate: -2, x: 0 }} transition={{ delay: 0.5, duration: 0.7, ease: EASE }} style={{ fontSize: 'clamp(22px, 2.2vw, 30px)', margin: '14px 0 0', maxWidth: 720 }}>
            {note}
          </motion.p>
        )}
        {children}
      </div>
    </header>
  )
}

export function Stat({ label, value, theme = 'paper', i = 0 }: { label: string; value: ReactNode; theme?: Theme; i?: number }) {
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
  const styles = { info: { background: 'var(--paper-2)', color: 'var(--ink)' }, error: { background: '#ffd9d4', color: '#7a1408' }, ok: { background: 'var(--lichen)', color: 'var(--pine)' } }[tone]
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
        <motion.rect x={56} y={4} width={8} height={14} rx={2} fill="var(--blaze)" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 1, type: 'spring' }} style={{ originY: 1 }} />
      </svg>
      <div className="chunk" style={{ fontSize: 26 }}>{title}</div>
      {children && <div className="body" style={{ maxWidth: 520, opacity: 0.75 }}>{children}</div>}
    </div>
  )
}

/** Probability bar that grows in. */
export function Prob({ p, color = 'var(--blaze)', width = 90 }: { p: number; color?: string; width?: number }) {
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
  const tone = status === 'dropped' ? ['var(--mute)', 'var(--ink)'] : badge === 'high' ? ['var(--lichen)', 'var(--pine)'] : badge === 'medium' ? ['var(--ice)', 'var(--glacier)'] : ['var(--blaze)', 'var(--ink)']
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
        <motion.div animate={{ scaleX: offline ? 0 : ready || engine !== 'jev' ? 1 : 1 - frac, background: ready ? 'var(--lichen)' : 'var(--blaze)' }} transition={{ duration: 0.5, ease: 'linear' }} style={{ height: '100%', transformOrigin: 'left' }} />
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
                <a key={label} href={e?.url || undefined} target="_blank" rel="noreferrer noopener" title={e ? `${e.ref} — ${e.title ?? ''}` : label} style={{ margin: '0 2px', padding: '1px 5px', borderRadius: 5, background: 'var(--blaze)', color: 'var(--ink)', textDecoration: 'none', fontWeight: 800, fontSize: 11 }}>
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
          <div className="d-row" style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--pine)', color: 'var(--lichen)' }}>
            <TrailSpinner label={stage} />
            <span className="small" style={{ opacity: 0.8 }}>
              {Math.round(elapsed)}s{engine === 'jev' && nextSlot > 1 ? ` · waiting ${Math.ceil(nextSlot)}s for the next Jev slot` : ''}
            </span>
            {onCancel && (
              <button className="d-chip" onClick={onCancel} style={{ marginLeft: 'auto', background: 'transparent', color: 'var(--lichen)', boxShadow: 'inset 0 0 0 1.5px var(--lichen)' }}>
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
  return { data, error, loading, reload: () => setTick((t) => t + 1) }
}

export function Loading({ label = 'Walking over' }: { label?: string }) {
  return (
    <div style={{ padding: 40, display: 'grid', placeItems: 'center' }}>
      <TrailSpinner label={label} />
    </div>
  )
}

export const q = (repo: string) => (repo ? `repo=${encodeURIComponent(repo)}` : '')
