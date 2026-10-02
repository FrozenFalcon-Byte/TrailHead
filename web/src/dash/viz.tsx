import { animate, AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

const EASE = [0.22, 1, 0.36, 1] as const

/* Small, animated charts drawn in SVG with the theme's tokens. None of them pull in a chart library. */

export const PALETTE = ['var(--violet)', 'var(--orange)', 'var(--green)', 'var(--blue)', 'var(--yellow)', 'var(--lime)', 'var(--stop)', 'var(--dim)']
const still = () => typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off'
const fmtAuto = (to: number) => (v: number) => (Number.isInteger(to) ? Math.round(v).toLocaleString() : v.toFixed(Math.abs(to) < 10 ? 2 : 1))

/** A number that counts up to its value, and counts again from where it was when the value changes. */
export function CountUp({ to, format, duration = 1.1, delay = 0 }: { to: number; format?: (v: number) => string; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  const fmt = format ?? fmtAuto(to)
  const fmtRef = useRef(fmt)
  fmtRef.current = fmt
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (still()) {
      el.textContent = fmtRef.current(to)
      from.current = to
      return
    }
    const c = animate(from.current, to, { duration, delay, ease: EASE, onUpdate: (v) => { el.textContent = fmtRef.current(v) } })
    from.current = to
    return () => c.stop()
  }, [to, duration, delay])
  return <span ref={ref} className="v-count">{fmt(from.current)}</span>
}

/** Tween 0 → 1 once on mount (and again when `key` changes); used where an SVG attribute has to be computed. */
function useTween(key: unknown, duration = 0.9, delay = 0) {
  const [t, setT] = useState(still() ? 1 : 0)
  useEffect(() => {
    if (still()) return setT(1)
    setT(0)
    const c = animate(0, 1, { duration, delay, ease: EASE, onUpdate: setT })
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return t
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setW(el.clientWidth)
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

export type Slice = { label: string; value: number; color?: string }

/** Donut with a live centre: hover a slice (or its legend row) to read it. */
export function Donut({ data, size = 156, thick = 20, label = 'total', legend = true, onPick, picked, format }: { data: Slice[]; size?: number; thick?: number; label?: string; legend?: boolean; onPick?: (s: Slice) => void; picked?: string; format?: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null)
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const r = (size - thick) / 2
  const gap = data.length > 1 ? 0.006 : 0
  let start = 0
  const on = hover != null ? data[hover] : data.find((d) => d.label === picked)
  const fmt = format ?? ((v: number) => v.toLocaleString())
  return (
    <div className={`v-donut ${legend ? '' : 'no-legend'}`}>
      <div className="v-donut__ring" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thick} opacity={0.5} />
          {data.map((d, i) => {
            const frac = d.value / total
            const s = start
            start += frac
            const dim = (hover != null && hover !== i) || (picked && picked !== d.label && hover == null)
            return (
              <motion.circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color ?? PALETTE[i % PALETTE.length]}
                strokeWidth={thick}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: Math.max(frac - gap, 0.002), opacity: dim ? 0.28 : 1, strokeWidth: hover === i ? thick + 6 : thick }}
                transition={{ pathLength: { duration: 1, delay: 0.15 + s * 0.6, ease: EASE }, default: { duration: 0.25 } }}
                style={{ rotate: s * 360 - 90, cursor: onPick ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onPick?.(d)}
              />
            )
          })}
        </svg>
        <div className="v-donut__mid">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div key={on?.label ?? '_'} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.2 }}>
              <b>{on ? fmt(on.value) : <CountUp to={data.reduce((a, d) => a + d.value, 0)} format={fmt} />}</b>
              <span>{on ? `${on.label} · ${Math.round((on.value / total) * 100)}%` : label}</span>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      {legend && (
        <ul className="v-legend">
          {data.map((d, i) => (
            <motion.li key={d.label} className={hover === i || picked === d.label ? 'is-on' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(d)} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.04, duration: 0.4, ease: EASE }} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <i style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
              <span>{d.label}</span>
              <b>{fmt(d.value)}</b>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Radial gauge for one probability or ratio (0..1). */
export function Gauge({ p, size = 72, thick = 8, color = 'var(--accent, var(--lime))', label, sub, delay = 0 }: { p: number; size?: number; thick?: number; color?: string; label?: ReactNode; sub?: ReactNode; delay?: number }) {
  const r = (size - thick) / 2
  const v = Math.max(0, Math.min(1, p || 0))
  return (
    <div className="v-gauge">
      <div className="v-gauge__dial" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thick} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thick} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: v }} transition={{ duration: 1.1, delay, ease: EASE }} style={{ rotate: -90 }} />
        </svg>
        <b style={{ fontSize: Math.max(12, size * 0.24) }}><CountUp to={Math.round(v * 100)} delay={delay} format={(x) => `${Math.round(x)}`} /><small>%</small></b>
      </div>
      {(label || sub) && (
        <div className="v-gauge__text">
          {label && <span className="v-gauge__label">{label}</span>}
          {sub && <span className="v-gauge__sub">{sub}</span>}
        </div>
      )}
    </div>
  )
}

/** Sparkline that draws itself; the last point gets a pulsing dot. */
export function Spark({ values, color = 'var(--accent, var(--lime))', h = 36, area = true }: { values: number[]; color?: string; h?: number; area?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const pts = useMemo(() => {
    if (values.length < 2 || !w) return [] as [number, number][]
    const max = Math.max(...values, 1)
    const min = Math.min(...values, 0)
    return values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 4 - ((v - min) / (max - min || 1)) * (h - 10)] as [number, number])
  }, [values, w, h])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <div ref={ref} className="v-spark" style={{ height: h }}>
      {pts.length > 1 && (
        <svg width={w} height={h} aria-hidden>
          {area && <motion.path d={`${d} L${last[0]},${h} L${pts[0][0]},${h} Z`} fill={color} initial={{ opacity: 0 }} animate={{ opacity: 0.16 }} transition={{ delay: 0.6, duration: 0.6 }} />}
          <motion.path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2, ease: EASE }} />
          <motion.circle cx={last[0]} cy={last[1]} r={3.5} fill={color} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1 }} />
          <circle cx={last[0]} cy={last[1]} r={3.5} fill={color} className="v-ping" />
        </svg>
      )}
    </div>
  )
}

export type Col = { label: string; value: number; color?: string; hint?: string }

/** Vertical column chart with a hover read-out. */
export function Columns({ data, h = 150, color = 'var(--violet)', format, ticks = 6, onPick }: { data: Col[]; h?: number; color?: string; format?: (v: number) => string; ticks?: number; onPick?: (c: Col, i: number) => void }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 0.0001)
  const fmt = format ?? ((v: number) => v.toLocaleString())
  const every = Math.max(1, Math.ceil(data.length / ticks))
  const on = hover != null ? data[hover] : null
  return (
    <div className="v-cols">
      <div className="v-cols__read">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={on?.label ?? '_'} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            {on ? <><b>{fmt(on.value)}</b> {on.hint ?? on.label}</> : <span className="d-muted">Hover a column</span>}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="v-cols__plot" style={{ height: h }} onMouseLeave={() => setHover(null)}>
        <div className="v-cols__grid" aria-hidden><i /><i /><i /></div>
        {data.map((d, i) => (
          <button key={d.label + i} type="button" className={`v-cols__col ${hover === i ? 'is-on' : ''}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => onPick?.(d, i)} aria-label={`${d.label}: ${fmt(d.value)}`} tabIndex={onPick ? 0 : -1}>
            <motion.span className="v-cols__bar" initial={{ scaleY: 0 }} animate={{ scaleY: d.value / max }} transition={{ duration: 0.8, delay: 0.1 + i * (0.5 / data.length), ease: EASE }} style={{ background: d.color ?? color }} />
          </button>
        ))}
      </div>
      <div className="v-cols__axis" aria-hidden>
        {data.map((d, i) => <span key={d.label + i}>{i % every === 0 ? d.label : ''}</span>)}
      </div>
    </div>
  )
}

export type Tile = { label: string; value: number; color?: string; sub?: string; onClick?: () => void }

function squarify(vals: number[], W: number, H: number) {
  const total = vals.reduce((a, v) => a + v, 0) || 1
  const areas = vals.map((v) => (v / total) * W * H)
  const out: { x: number; y: number; w: number; h: number }[] = []
  let x = 0, y = 0, w = W, h = H, i = 0
  const worst = (row: number[], side: number) => {
    const s = row.reduce((a, v) => a + v, 0)
    return Math.max(...row.map((r) => Math.max((side * side * r) / (s * s), (s * s) / (side * side * r))))
  }
  while (i < areas.length) {
    const side = Math.min(w, h)
    let row = [areas[i]]
    while (i + row.length < areas.length && worst([...row, areas[i + row.length]], side) <= worst(row, side)) row = [...row, areas[i + row.length]]
    const s = row.reduce((a, v) => a + v, 0)
    if (w >= h) {
      const cw = s / h
      let yy = y
      row.forEach((a) => { out.push({ x, y: yy, w: cw, h: a / cw }); yy += a / cw })
      x += cw; w -= cw
    } else {
      const rh = s / w
      let xx = x
      row.forEach((a) => { out.push({ x: xx, y, w: a / rh, h: rh }); xx += a / rh })
      y += rh; h -= rh
    }
    i += row.length
  }
  return out
}

/** Squarified treemap; tiles pop in largest first and can be clicked. */
export function Treemap({ items, h = 260 }: { items: Tile[]; h?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const sorted = useMemo(() => [...items].filter((t) => t.value > 0).sort((a, b) => b.value - a.value), [items])
  const rects = useMemo(() => (w ? squarify(sorted.map((t) => t.value), w, h) : []), [sorted, w, h])
  return (
    <div ref={ref} className="v-tree" style={{ height: h }}>
      {rects.map((r, i) => {
        const t = sorted[i]
        const roomy = r.w > 74 && r.h > 40
        return (
          <motion.button
            key={t.label}
            type="button"
            className={`v-tree__tile ${roomy ? '' : 'is-tiny'}`}
            style={{ left: r.x, top: r.y, width: r.w, height: r.h, '--c': t.color ?? PALETTE[i % PALETTE.length] } as React.CSSProperties}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.05 + i * 0.03 }}
            onClick={t.onClick}
            data-cursor={t.onClick ? `Open ${t.label}` : undefined}
            title={`${t.label}: ${t.value.toLocaleString()}`}
          >
            <span>
              {roomy && <b>{t.label}</b>}
              {roomy && <small>{t.sub ?? t.value.toLocaleString()}</small>}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Activity heat grid: rows × columns of counts, cells pop in on a diagonal sweep. */
export function Heat({ grid, rows, cols, color = 'var(--violet)', unit = 'events' }: { grid: number[][]; rows: string[]; cols: string[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...grid.flat())
  const [on, setOn] = useState<[number, number] | null>(null)
  const every = Math.max(1, Math.ceil(cols.length / 8))
  return (
    <div className="v-heat">
      <div className="v-heat__read">{on ? <><b>{grid[on[0]][on[1]]}</b> {unit} · {rows[on[0]]} {cols[on[1]]}</> : <span className="d-muted">Hover a cell</span>}</div>
      <div className="v-heat__grid" style={{ gridTemplateColumns: `auto repeat(${cols.length}, 1fr)` }} onMouseLeave={() => setOn(null)}>
        {grid.map((row, r) => [
          <span key={`l${r}`} className="v-heat__row">{rows[r]}</span>,
          ...row.map((v, c) => (
            <motion.i
              key={`${r}-${c}`}
              onMouseEnter={() => setOn([r, c])}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: (r + c) * 0.012, type: 'spring', stiffness: 400, damping: 24 }}
              style={{ background: v ? `color-mix(in srgb, ${color} ${Math.round(18 + (v / max) * 82)}%, transparent)` : undefined }}
              className={on && on[0] === r && on[1] === c ? 'is-on' : ''}
            />
          )),
        ])}
        <span />
        {cols.map((c, i) => <span key={c + i} className="v-heat__col">{i % every === 0 ? c : ''}</span>)}
      </div>
    </div>
  )
}

/** Radar for comparing a few series across the same 0..1 metrics. */
export function Radar({ axes, series, size = 240 }: { axes: string[]; series: { label: string; values: number[]; color?: string }[]; size?: number }) {
  const t = useTween(series.map((s) => s.label + s.values.join()).join('|'), 1.1, 0.15)
  const [hover, setHover] = useState<number | null>(null)
  const c = size / 2
  const R = c - 34
  const pt = (i: number, v: number) => {
    const a = (i / axes.length) * Math.PI * 2 - Math.PI / 2
    return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]
  }
  return (
    <div className="v-radar">
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`Comparison across ${axes.join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={axes.map((_, i) => pt(i, k).join(',')).join(' ')} fill="none" stroke="var(--line)" strokeWidth={1} />)}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 1)
          const [lx, ly] = pt(i, 1.2)
          return (
            <g key={a}>
              <line x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - c) < 6 ? 'middle' : lx > c ? 'start' : 'end'} dominantBaseline="middle" className="v-radar__axis">{a}</text>
            </g>
          )
        })}
        {series.map((s, si) => {
          const col = s.color ?? PALETTE[si % PALETTE.length]
          const pts = s.values.map((v, i) => pt(i, Math.max(0, Math.min(1, v)) * t).join(',')).join(' ')
          const dim = hover != null && hover !== si
          return (
            <g key={s.label} style={{ opacity: dim ? 0.15 : 1, transition: 'opacity .25s' }}>
              <polygon points={pts} fill={col} fillOpacity={0.16} stroke={col} strokeWidth={2} strokeLinejoin="round" />
              {s.values.map((v, i) => {
                const [x, y] = pt(i, Math.max(0, Math.min(1, v)) * t)
                return <circle key={i} cx={x} cy={y} r={3} fill={col} />
              })}
            </g>
          )
        })}
      </svg>
      <ul className="v-legend is-row">
        {series.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? 'is-on' : ''}>
            <i style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />
            <span>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type Dot = { x: number; y: number; label: string; color?: string; r?: number; onClick?: () => void }

/** Scatter plot on a 0..1 square, with axis names and a hover label. */
export function Scatter({ points, x, y, h = 240 }: { points: Dot[]; x: string; y: string; h?: number }) {
  const [on, setOn] = useState<number | null>(null)
  const p = on != null ? points[on] : null
  return (
    <div className="v-scatter">
      <div className="v-cols__read">{p ? <><b>{p.label}</b> · {x} {p.x.toFixed(2)} · {y} {p.y.toFixed(2)}</> : <span className="d-muted">Hover a dot</span>}</div>
      <div className="v-scatter__plot" style={{ height: h }} onMouseLeave={() => setOn(null)}>
        <div className="v-scatter__grid" aria-hidden><i /><i /><i /><b /><b /><b /></div>
        {points.map((d, i) => (
          <motion.button
            key={d.label + i}
            type="button"
            className={`v-scatter__dot ${on === i ? 'is-on' : ''}`}
            style={{ left: `${d.x * 100}%`, bottom: `${d.y * 100}%`, width: (d.r ?? 6) * 2, height: (d.r ?? 6) * 2, background: d.color ?? 'var(--violet)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.02, type: 'spring', stiffness: 300, damping: 18 }}
            onMouseEnter={() => setOn(i)}
            onFocus={() => setOn(i)}
            onClick={d.onClick}
            aria-label={d.label}
          />
        ))}
        <span className="v-scatter__x">{x} →</span>
        <span className="v-scatter__y">{y} →</span>
      </div>
    </div>
  )
}

/** A pipeline diagram: stations joined by a track with packets flowing along it. `at` marks the current step. */
export function Flow({ steps, at = -1, running = false, color = 'var(--accent, var(--lime))' }: { steps: { label: string; sub?: string }[]; at?: number; running?: boolean; color?: string }) {
  return (
    <ol className={`v-flow ${running ? 'is-running' : ''}`} style={{ '--c': color } as React.CSSProperties}>
      {steps.map((s, i) => {
        const state = at < 0 ? 'idle' : i < at ? 'done' : i === at ? 'now' : 'next'
        return (
          <motion.li key={s.label} className={`v-flow__step is-${state}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.08, duration: 0.45, ease: EASE }}>
            <span className="v-flow__node">
              {state === 'done' ? '✓' : i + 1}
              {state === 'now' && <span className="v-flow__halo" />}
            </span>
            <span className="v-flow__text">
              <b>{s.label}</b>
              {s.sub && <small>{s.sub}</small>}
            </span>
            {i < steps.length - 1 && (
              <span className="v-flow__track" aria-hidden>
                <i /><i /><i />
              </span>
            )}
          </motion.li>
        )
      })}
    </ol>
  )
}

/** Stacked horizontal meter: parts of one whole. */
export function Meter({ parts, h = 14 }: { parts: Slice[]; h?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div className="v-meter" style={{ height: h }}>
      {parts.map((p, i) => (
        <motion.span key={p.label} title={`${p.label}: ${p.value}`} initial={{ flexGrow: 0 }} animate={{ flexGrow: p.value / total }} transition={{ duration: 0.9, delay: 0.1 + i * 0.06, ease: EASE }} style={{ background: p.color ?? PALETTE[i % PALETTE.length] }} />
      ))}
    </div>
  )
}

/** Looping motion graphic for hero cards: a trail winds across, a walker follows it, waypoints light up as it passes. */
export function TrailLoop({ color = 'var(--violet)', dots = ['var(--orange)', 'var(--green)', 'var(--blue)', 'var(--yellow)'] }: { color?: string; dots?: string[] }) {
  const d = 'M10,70 C60,10 110,110 160,55 S250,10 300,50 S380,100 430,40'
  const stops = [[60, 40], [160, 55], [300, 50], [400, 66]]
  return (
    <svg className="v-trailloop" viewBox="0 0 440 110" aria-hidden preserveAspectRatio="xMidYMid meet">
      <motion.path d={d} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={10} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeDasharray="2 9" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE, delay: 0.2 }} />
      {stops.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={9} fill={dots[i % dots.length]} className="v-trailloop__stop" style={{ animationDelay: `${0.9 + i * 0.9}s` }} />
          <circle cx={x} cy={y} r={3} fill="var(--paper)" />
        </g>
      ))}
      <circle r={7} fill="var(--ink)" className="v-trailloop__walker" style={{ offsetPath: `path('${d}')` }} />
    </svg>
  )
}

/** Small live indicator: a dot with an expanding ring. */
export function Live({ ok = true }: { ok?: boolean }) {
  return <span className={`v-live ${ok ? 'is-ok' : 'is-bad'}`} aria-hidden><i /></span>
}

/** Bucket timestamps (seconds) into the last `days` days. */
export function byDay(ts: number[], days = 14) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out = Array.from({ length: days }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() - (days - 1 - i))
    return { day: d, n: 0 }
  })
  const first = out[0].day.getTime()
  ts.forEach((t) => {
    const k = Math.floor((t * 1000 - first) / 86400000)
    if (k >= 0 && k < days) out[k].n++
  })
  return out.map((o) => ({ label: o.day.toLocaleDateString([], { month: 'short', day: 'numeric' }), value: o.n }))
}

/** Bucket timestamps into weekday × hour-of-day counts. */
export function weekHours(ts: number[], step = 2) {
  const cols = Array.from({ length: 24 / step }, (_, i) => `${String(i * step).padStart(2, '0')}h`)
  const rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const grid = rows.map(() => cols.map(() => 0))
  ts.forEach((t) => {
    const d = new Date(t * 1000)
    grid[(d.getDay() + 6) % 7][Math.floor(d.getHours() / step)]++
  })
  return { grid, rows, cols }
}

/** Histogram of 0..1 values. */
export function histogram(values: number[], bins = 10, color?: string) {
  const out = Array.from({ length: bins }, (_, i) => ({ label: (i / bins).toFixed(1), value: 0, hint: `between ${(i / bins).toFixed(1)} and ${((i + 1) / bins).toFixed(1)}`, color }))
  values.forEach((v) => { out[Math.min(bins - 1, Math.max(0, Math.floor(v * bins)))].value++ })
  return out
}
