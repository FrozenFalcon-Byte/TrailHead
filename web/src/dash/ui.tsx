import { animate, AnimatePresence, motion } from 'motion/react'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { api, stream } from '../lib/api'
import type { BeamStep } from '../motion/BeamColumns'
import { Shape } from '../motion/Shapes'
import { SplitReveal } from '../motion/SplitReveal'
import { TrailSpinner } from '../motion/TrailSpinner'
import { TrailLoader } from '../motion/TrailLoader'
import { Link, useLocation } from 'react-router-dom'
import { itemFor } from './nav'
import { useDash } from './context'
import { CountUp, Spark } from './viz'

export const EASE = [0.22, 1, 0.36, 1] as const
export type Theme = 'cream' | 'peach' | 'lilac' | 'mint' | 'butter' | 'sky' | 'lime'

/** Page masthead. No backdrop: the page's own sign (the same shape as in the sidebar) flies over from the sidebar
 *  when the page opens, next to the title in big type with a trail drawn under the key word. Tools (a search box,
 *  a form) sit underneath. `theme` is kept for callers but the colour now comes from the page itself. */
export function PageHead({ kicker, title, oblique, note, actions, children }: { theme?: Theme; kicker: string; title: string; oblique?: string; note?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  const location = useLocation()
  const item = itemFor(location.pathname)
  const { repo } = useDash()
  const icon = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = icon.current
    const src = document.querySelector('.d-nav a.active .d-nav__icon')
    if (!el || !src || document.documentElement.dataset.morph || document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const a = src.getBoundingClientRect()
    const b = el.getBoundingClientRect()
    if (!a.width || a.right < 0 || !b.width) return
    const dx = a.left + a.width / 2 - (b.left + b.width / 2)
    const dy = a.top + a.height / 2 - (b.top + b.height / 2)
    // Above everything while it flies over the sidebar, back under the top bar once it lands.
    el.style.zIndex = '70'
    animate(el, { x: [dx, 0], y: [dy, 0], scale: [a.width / b.width, 1], rotate: [-14, 0] }, { type: 'spring', stiffness: 150, damping: 20, mass: 0.9 }).then(() => { el.style.zIndex = '' })
    // Only on arrival; the masthead stays put afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <header className="d-mast" style={{ ['--page' as string]: item.color, ['--page-bg' as string]: item.bg }}>
      <div className="d-mast__row">
        <div className="d-mast__icon" ref={icon} aria-hidden>
          <Shape kind={item.kind} color={item.color} glyph={item.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
        </div>
        <div className="d-mast__copy">
          <motion.div className="d-mast__crumb" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}>
            <span>{item.group}</span>
            <i aria-hidden />
            <span>{kicker}</span>
            {repo && item.group !== 'You' && (
              <>
                <i aria-hidden />
                <span className="mono">{repo}</span>
              </>
            )}
          </motion.div>
          <h1 className="chunk d-mast__title">
            <SplitReveal text={title} immediate delay={0.12} stagger={0.035} />
            {oblique && (
              <>
                {' '}
                <span className="d-mast__ob">
                  <motion.span style={{ display: 'inline-block' }} initial={{ y: '0.6em', opacity: 0, rotate: 3 }} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.3 }}>{oblique}</motion.span>
                  <svg className="d-mast__trail" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden>
                    <motion.path d="M3 13 C 30 4, 52 18, 80 10 S 130 3, 160 11 S 190 14, 197 7" fill="none" stroke="var(--page)" strokeWidth={6} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.65, 0, 0.35, 1], delay: 0.5 }} />
                  </svg>
                </span>
              </>
            )}
          </h1>
          {note && (
            <motion.p className="d-mast__note" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5, ease: EASE }}>
              {note}
            </motion.p>
          )}
        </div>
        {actions && (
          <motion.div className="d-mast__actions" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4, ease: EASE }}>
            {actions}
          </motion.div>
        )}
      </div>
      {children && (
        <motion.div className="d-mast__tools" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.55, ease: EASE }}>
          {children}
        </motion.div>
      )}
    </header>
  )
}

export function Stat({ label, value, theme = 'cream', i = 0, hint, to }: { label: string; value: ReactNode; theme?: Theme; i?: number; hint?: string; to?: string }) {
  const body = (
    <>
      <span className="small d-stat__label">{label}</span>
      <span className="v">{value}</span>
      {hint && <span className="small d-stat__hint">{hint}</span>}
    </>
  )
  return (
    <motion.div className={`d-stat t-${theme}`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 + i * 0.04 }} whileHover={{ y: -3 }}>
      {to ? <Link to={to} className="d-stat__link">{body}</Link> : body}
    </motion.div>
  )
}

/** Refresh control whose arrow really spins while the data is being fetched again. */
export function RefreshButton({ onClick, busy, label = 'Refresh' }: { onClick: () => void; busy: boolean; label?: string }) {
  return (
    <button className="d-chip d-refresh" onClick={onClick} disabled={busy} data-cursor={busy ? 'Refreshing…' : label}>
      <motion.span aria-hidden style={{ display: 'inline-block' }} animate={busy ? { rotate: 360 } : { rotate: 0 }} transition={busy ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}>↻</motion.span>
      {busy ? 'Refreshing…' : label}
    </button>
  )
}

export function Card({ children, title, aside, theme, style, delay = 0, className = '', span, icon }: { children: ReactNode; title?: ReactNode; aside?: ReactNode; theme?: Theme; style?: React.CSSProperties; delay?: number; className?: string; span?: number; icon?: ReactNode }) {
  return (
    <section className={`d-card ${theme ? `tinted t-${theme}` : ''} ${span ? `span-${span}` : ''} ${className}`} style={{ ...style, animationDelay: delay ? `${delay}s` : undefined }}>
      {(title || aside) && (
        <div className="d-card__head">
          {title && <h3 className="chunk d-card__title">{icon}{title}</h3>}
          {aside && <div className="d-card__aside">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** One strip of headline numbers, divided like a trail sign's mileage board. */
export function Kpis({ items, delay = 0 }: { items: { label: string; value: ReactNode; hint?: string; to?: string; color?: string; spark?: number[]; format?: (v: number) => string }[]; delay?: number }) {
  return (
    <motion.section className="d-kpis" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, ease: EASE, delay }}>
      {items.map((it, i) => {
        const body = (
          <>
            <span className="d-kpi__label"><i style={{ background: it.color ?? 'var(--accent)' }} />{it.label}</span>
            <motion.span className="d-kpi__value" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: delay + 0.08 + i * 0.05, duration: 0.5, ease: EASE }}>
              {typeof it.value === 'number' ? <CountUp to={it.value} format={it.format} delay={delay + i * 0.05} /> : it.value}
            </motion.span>
            {it.spark && it.spark.length > 1 && <Spark values={it.spark} color={it.color} h={26} />}
            {it.hint && <span className="d-kpi__hint">{it.hint}</span>}
            <motion.span className="d-kpi__bar" style={{ background: it.color ?? 'var(--accent)' }} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: delay + 0.2 + i * 0.06, duration: 0.8, ease: EASE }} />
          </>
        )
        return it.to ? <Link key={it.label} to={it.to} className="d-kpi" data-cursor={`Open ${it.label}`}>{body}</Link> : <div key={it.label} className="d-kpi">{body}</div>
      })}
    </motion.section>
  )
}

/** Main column plus a side rail; the rail drops under the main column on narrow screens. */
export function Split({ children, aside, wide }: { children: ReactNode; aside?: ReactNode; wide?: boolean }) {
  return (
    <div className={`d-split ${wide ? 'is-wide' : ''} ${aside ? '' : 'no-aside'}`}>
      <div className="d-split__main">{children}</div>
      {aside && <aside className="d-split__aside">{aside}</aside>}
    </div>
  )
}

/** A dense list row: a lead (badge, number, icon), the text, and something on the right. */
export function Row({ lead, title, sub, end, to, href, onClick, active, i = 0, path }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; to?: string; href?: string; onClick?: () => void; active?: boolean; i?: number; path?: string }) {
  const inner = (
    <>
      {lead && <span className="d-li__lead">{lead}</span>}
      <span className="d-li__text">
        <span className="d-li__title">{title}</span>
        {sub && <span className="d-li__sub">{sub}</span>}
      </span>
      {end && <span className="d-li__end">{end}</span>}
    </>
  )
  const cls = `d-li ${active ? 'is-on' : ''} ${to || href || onClick ? 'is-link' : ''}`
  const anim = { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, transition: { delay: Math.min(i, 12) * 0.03, duration: 0.4, ease: EASE } }
  if (to) return <motion.div {...anim}><Link to={to} className={cls} data-path={path}>{inner}</Link></motion.div>
  if (href) return <motion.div {...anim}><a href={href} target="_blank" rel="noreferrer noopener" className={cls} data-path={path}>{inner}</a></motion.div>
  if (onClick) return <motion.button {...anim} type="button" className={cls} onClick={onClick} data-path={path}>{inner}</motion.button>
  return <motion.div {...anim} className={cls} data-path={path}>{inner}</motion.div>
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

/** Probability as a small dial that winds up to its value, with the score in the middle. */
export function Prob({ p, color = 'var(--orange)', size = 34 }: { p: number; color?: string; width?: number; size?: number }) {
  const stroke = size < 40 ? 3 : 4
  const r = size / 2 - stroke / 2 - 1
  const pct = Math.round(p * 100)
  // The number has to fit inside the ring: shrink it for three digits, and drop the % sign on small dials.
  const withSign = size >= 44
  const inner = size - stroke * 2 - 4
  const font = Math.min(size * 0.3, inner / (String(pct).length * 0.62 + (withSign ? 0.45 : 0)))
  return (
    <span className="d-dial" title={`${pct}%`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: Math.max(0.02, Math.min(1, p)) }} transition={{ duration: 0.9, ease: EASE }} />
      </svg>
      <b style={{ fontSize: font }}>{pct}{withSign && <small>%</small>}</b>
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

/** GET with loading and error state; refetches when the path changes, on reload(), and when the page-level
 *  refresh (context menu, the R key) fires. `reloading` is true while fresh data replaces what is shown. */
export function useFetch<T>(path: string | null) {
  // While the API is down the Gate panel explains it; a raw "Failed to fetch" on top would only add noise.
  const { offline } = useDash()
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const again = () => setTick((t) => t + 1)
    window.addEventListener('th:refresh', again)
    return () => window.removeEventListener('th:refresh', again)
  }, [])
  useEffect(() => {
    if (!path) return
    let alive = true
    setLoading(true)
    setError('')
    const started = performance.now()
    api<T>(path)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        const wait = Math.max(0, 450 - (performance.now() - started))
        window.setTimeout(() => alive && setLoading(false), wait)
      })
    return () => {
      alive = false
    }
  }, [path, tick])
  return { data, error: offline ? '' : error, loading, reloading: loading && data !== null, reload: () => setTick((t) => t + 1) }
}

export function Loading({ label = 'Walking over', hints }: { label?: string; hints?: string[] }) {
  return <TrailLoader label={label} hints={hints ?? ['Reading the map', 'Checking the path']} />
}

export const q = (repo: string) => (repo ? `repo=${encodeURIComponent(repo)}` : '')

/** What a page needs before it can do anything: the API running and, usually, an ingested repository.
 *  Renders nothing when both are there; otherwise one clear panel with the next step. While the API is down it
 *  checks again every few seconds on its own and says when it last looked. */
export function Gate({ needsRepo = true }: { needsRepo?: boolean }) {
  const { offline, repo, recheck, checking, lastCheck } = useDash()
  const [copied, setCopied] = useState('')
  const [, tick] = useState(0)
  useEffect(() => {
    if (!offline) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [offline])
  if (!offline && (repo || !needsRepo)) return null
  const copy = (cmd: string) => {
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(cmd)
      window.setTimeout(() => setCopied(''), 1400)
    }, () => undefined)
  }
  const since = lastCheck ? Math.max(0, Math.round((Date.now() - lastCheck) / 1000)) : 0
  const steps = [
    { n: 1, text: 'Open a terminal in the Trailhead folder', cmd: 'cd ~/Desktop/Projs/TrailHead' },
    { n: 2, text: 'Start the API (it keeps running in that terminal)', cmd: 'bin/trailhead serve' },
  ]
  return (
    <motion.section className={`d-gate ${offline ? 't-peach' : 't-mint'}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: EASE }} layout>
      <div className="d-gate__art" aria-hidden>
        <Shape kind={offline ? 'tag' : 'square'} color={offline ? 'var(--orange)' : 'var(--green)'} glyph={offline ? 'signal' : 'folder'} size={0} style={{ width: '100%', height: 'auto' }} />
        <motion.span className="d-gate__pulse" style={{ background: offline ? 'var(--orange)' : 'var(--green)' }} animate={{ scale: [1, 1.8], opacity: [0.5, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }} />
      </div>
      <div className="d-gate__copy">
        <h2 className="chunk">{offline ? 'The Trailhead API is not running' : 'No repository yet'}</h2>
        <p>
          {offline
            ? 'Everything on these pages is computed by the local API. Start it, and this page connects by itself.'
            : 'Ingest one first. It reads code, commits, pull requests and issues, and never runs the code.'}
        </p>
        {offline ? (
          <>
            <ol className="d-gate__steps">
              {steps.map((st) => (
                <li key={st.n}>
                  <span className="d-gate__n">{st.n}</span>
                  <span className="small">{st.text}</span>
                  <button className="d-gate__cmd mono" onClick={() => copy(st.cmd)} data-cursor="Copy command">
                    <span>$ {st.cmd}</span>
                    <b>{copied === st.cmd ? 'copied' : 'copy'}</b>
                  </button>
                </li>
              ))}
            </ol>
            <div className="d-row">
              <button className="btn small" onClick={() => recheck()} disabled={checking} data-cursor={checking ? 'Checking…' : 'Check now'}>
                <span>{checking ? 'Checking…' : 'Check now'}</span>
                <span className="arrow">
                  <motion.span style={{ display: 'inline-block' }} animate={checking ? { rotate: 360 } : { rotate: 0 }} transition={checking ? { duration: 0.7, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }}>↻</motion.span>
                </span>
              </button>
              <span className="small" style={{ opacity: 0.7 }}>{checking ? 'Asking the API…' : `Checks every 4 seconds · last ${since}s ago`}</span>
            </div>
          </>
        ) : (
          <div className="d-row">
            <Link to="/app/repos" className="btn small">
              <span>Add a repository</span>
              <span className="arrow">→</span>
            </Link>
          </div>
        )}
      </div>
    </motion.section>
  )
}
