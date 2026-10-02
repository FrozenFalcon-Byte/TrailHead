import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/* The app's own dropdown. A pill trigger; the list unfolds out of it like a trail sign flipping open, options
   drop in one after another, and the highlight slides between them. Full keyboard support (arrows, Home/End,
   Enter, Escape, type to jump), a filter box for long lists, and it lives in a portal so no card clips it. */

export type Option = { value: string; label: string; hint?: string; icon?: ReactNode; tone?: 'action'; disabled?: boolean }

type Props = {
  value: string
  onChange: (v: string) => void
  options: Option[]
  label?: string
  placeholder?: string
  mono?: boolean
  width?: number | string
  searchable?: boolean
  className?: string
  disabled?: boolean
  align?: 'start' | 'end'
}

const EASE = [0.22, 1, 0.36, 1] as const

export function Select({ value, onChange, options, label, placeholder = 'Choose…', mono, width, searchable, className, disabled, align = 'start' }: Props) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(0)
  const [query, setQuery] = useState('')
  const [box, setBox] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()
  const current = options.find((o) => o.value === value)
  const filterOn = searchable ?? options.length > 8
  const shown = useMemo(() => (query ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(query.toLowerCase())) : options), [options, query])

  const place = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const w = Math.max(r.width, 220)
    const below = window.innerHeight - r.bottom
    const left = align === 'end' ? Math.max(8, r.right - w) : Math.min(r.left, window.innerWidth - w - 8)
    setBox({ left, top: below < 280 && r.top > below ? r.top - 8 : r.bottom + 8, width: w, up: below < 280 && r.top > below })
  }
  useLayoutEffect(() => {
    if (!open) return
    place()
    setQuery('')
    setHi(Math.max(0, options.findIndex((o) => o.value === value)))
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!trigger.current?.contains(t) && !list.current?.contains(t)) setOpen(false)
    }
    const move = () => place()
    window.addEventListener('pointerdown', away)
    window.addEventListener('resize', move)
    window.addEventListener('scroll', move, true)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('resize', move)
      window.removeEventListener('scroll', move, true)
    }
  }, [open])
  useEffect(() => {
    list.current?.querySelector(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi])

  const choose = (o: Option | undefined) => {
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
    trigger.current?.focus()
  }
  const step = (d: number) => {
    if (!shown.length) return
    let i = hi
    for (let n = 0; n < shown.length; n++) {
      i = (i + d + shown.length) % shown.length
      if (!shown[i].disabled) break
    }
    setHi(i)
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') step(1)
    else if (e.key === 'ArrowUp') step(-1)
    else if (e.key === 'Home') setHi(0)
    else if (e.key === 'End') setHi(shown.length - 1)
    else if (e.key === 'Enter') choose(shown[hi])
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      if (e.key === 'Escape') trigger.current?.focus()
      return
    } else if (!filterOn && e.key.length === 1) {
      const now = performance.now()
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const hit = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) setHi(hit)
      return
    } else return
    e.preventDefault()
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`sel ${mono ? 'mono' : ''} ${open ? 'is-open' : ''} ${className ?? ''}`}
        style={{ width }}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        data-cursor={open ? 'Close' : label ? `Change ${label.toLowerCase()}` : 'Choose'}
      >
        {current?.icon && <span className="sel__icon">{current.icon}</span>}
        <motion.span key={current?.value ?? '_'} className="sel__value" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.25, ease: EASE }}>
          {current?.label ?? placeholder}
        </motion.span>
        <motion.svg className="sel__chev" width={10} height={6} viewBox="0 0 10 6" animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }} aria-hidden>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </motion.svg>
      </button>
      {createPortal(
        <AnimatePresence>
          {open && box && (
            <motion.div
              ref={list}
              id={id}
              role="listbox"
              className="sel__pop"
              tabIndex={-1}
              onKeyDown={onKey}
              style={{ left: box.left, top: box.top, width: box.width, translateY: box.up ? '-100%' : 0, transformOrigin: box.up ? '50% 100%' : '50% 0%' }}
              initial={{ opacity: 0, scaleY: 0.6, scaleX: 0.92, clipPath: 'inset(0 0 100% 0 round 18px)' }}
              animate={{ opacity: 1, scaleY: 1, scaleX: 1, clipPath: 'inset(0 0 0% 0 round 18px)' }}
              exit={{ opacity: 0, scaleY: 0.8, scaleX: 0.96, transition: { duration: 0.16 } }}
              transition={{ duration: 0.34, ease: EASE }}
            >
              {filterOn && (
                <input className="sel__filter" autoFocus placeholder="Filter…" value={query} onChange={(e) => { setQuery(e.target.value); setHi(0) }} onKeyDown={onKey} aria-label="Filter options" />
              )}
              <div className="sel__list">
                {shown.map((o, i) => (
                  <motion.div
                    key={o.value}
                    data-i={i}
                    role="option"
                    aria-selected={o.value === value}
                    aria-disabled={o.disabled}
                    className={`sel__opt ${o.tone === 'action' ? 'is-action' : ''} ${o.disabled ? 'is-off' : ''}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 + Math.min(i, 10) * 0.025, duration: 0.28, ease: EASE }}
                    onPointerMove={() => hi !== i && setHi(i)}
                    onClick={() => choose(o)}
                    data-cursor={o.tone === 'action' ? o.label.replace(/^\+\s*/, '') : `Use ${o.label}`}
                  >
                    {i === hi && <motion.span layoutId={`${id}-hi`} className="sel__hi" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                    {o.icon && <span className="sel__icon">{o.icon}</span>}
                    <span className={`sel__text ${mono ? 'mono' : ''}`}>
                      {o.label}
                      {o.hint && <small>{o.hint}</small>}
                    </span>
                    {o.value === value && (
                      <motion.svg width={14} height={14} viewBox="0 0 14 14" className="sel__tick" aria-hidden>
                        <motion.path d="M2 7.5l3.2 3L12 3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, delay: 0.1 }} />
                      </motion.svg>
                    )}
                  </motion.div>
                ))}
                {shown.length === 0 && <div className="sel__none small">Nothing matches “{query}”.</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

/** Segmented control: a pill slides under the chosen option. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label?: string }) {
  const id = useId()
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'is-on' : ''} onClick={() => onChange(o.value)} data-cursor={o.value === value ? 'Selected' : `Use ${o.label}`}>
          {o.value === value && <motion.span layoutId={`${id}-seg`} className="seg__pill" transition={{ type: 'spring', stiffness: 480, damping: 36 }} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** On/off switch whose knob squashes as it travels. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`tgl ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)} data-cursor={on ? `Turn off` : `Turn on`}>
      <motion.span className="tgl__knob" layout transition={{ type: 'spring', stiffness: 600, damping: 32 }} whileTap={{ scaleX: 1.3 }}>
        <motion.svg width={12} height={12} viewBox="0 0 12 12" aria-hidden initial={false} animate={{ opacity: on ? 1 : 0, scale: on ? 1 : 0.4 }}>
          <path d="M2 6.5l2.6 2.4L10 3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      </motion.span>
    </button>
  )
}

/** Range slider with a value bubble that follows the thumb. */
export function Slider({ value, onChange, min, max, step = 1, format = (v) => String(v), label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string; label: string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="sld" style={{ ['--pct' as string]: `${pct}%` }}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <motion.span className="sld__val mono" key={value} initial={{ y: -4, scale: 0.9 }} animate={{ y: 0, scale: 1 }}>{format(value)}</motion.span>
    </div>
  )
}
