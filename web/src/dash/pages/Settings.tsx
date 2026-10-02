import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { resetOnboarded } from '../../lib/onboard'
import { clearSaved } from '../../lib/history'
import { DEFAULTS, resetPrefs, sanitize, setPrefs, usePrefs, type Prefs } from '../../lib/prefs'
import { isLocalOrigin, shareOrigin } from '../../lib/qr'
import { useTheme } from '../../lib/theme'
import { errorText, notify, toast } from '../../lib/toast'
import { Shape, type Glyph, type ShapeKind } from '../../motion/Shapes'
import { Select, Slider, Toggle } from '../../motion/Select'
import { useDash } from '../context'
import { NAV } from '../nav'
import { EASE, PageHead, RefreshButton } from '../ui'

/* Settings are about how the app behaves on this device (and, with sync on, every device). Who you are and how
   you sign in lives in Profile. Each section opens on a live stage that shows what its settings do, with the
   controls as tiles beside it. */

type Item = { label: string; hint?: string; keys: string; control?: ReactNode; on?: boolean; set?: (v: boolean) => void; wide?: boolean }
type Section = { id: string; title: string; blurb: string; kind: ShapeKind; color: string; glyph: Glyph; stage: ReactNode; items: Item[]; body?: ReactNode }

const ACCENTS: Prefs['accent'][] = ['lime', 'orange', 'violet', 'blue', 'green', 'yellow']

/* ---------- Building blocks ---------- */

/** A row of picture cards: each option draws what it does. */
function Choice<T extends string>({ value, onChange, options, name, cols }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string; art: ReactNode }[]; name: string; cols?: number }) {
  return (
    <div className="s-choice" role="radiogroup" aria-label={name} style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={o.value} role="radio" aria-checked={on} className={`s-choice__opt ${on ? 'is-on' : ''}`} onClick={() => onChange(o.value)} data-cursor={on ? 'Selected' : `Use ${o.label}`}>
            {on && <motion.span layoutId={`s-choice-${name}`} className="s-choice__ring" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
            <span className="s-choice__art" aria-hidden>{o.art}</span>
            <span className="s-choice__label">{o.label}</span>
            {o.hint && <span className="s-choice__hint">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

function Tile({ item, i }: { item: Item; i: number }) {
  const toggle = item.set && item.on !== undefined
  return (
    <motion.div
      className={`s-tile ${item.wide ? 'is-wide' : ''} ${toggle ? 'is-switch' : ''} ${toggle && item.on ? 'is-on' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay: 0.08 + Math.min(i, 10) * 0.035 }}
      onClick={toggle ? (e) => { if (!(e.target as HTMLElement).closest('button, a, input, label')) item.set!(!item.on) } : undefined}
    >
      <div className="s-tile__copy">
        <span className="s-tile__label">{item.label}</span>
        {item.hint && <span className="s-tile__hint">{item.hint}</span>}
      </div>
      <div className="s-tile__control">{toggle ? <Toggle on={item.on!} onChange={item.set!} label={item.label} /> : item.control}</div>
    </motion.div>
  )
}

function Status({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return <span className={`d-tag ${ok === null ? '' : ok ? 'is-ok' : 'is-bad'}`}>{children}</span>
}

/** One connection on the plug board. A seated plug means it works; a loose one means it is missing. */
type Plug = { name: string; what: string; detail?: string; ok: boolean | null; color: string; action?: ReactNode }
function Plugboard({ plugs }: { plugs: Plug[] }) {
  return (
    <ol className="pb">
      {plugs.map((p, i) => {
        const state = p.ok === null ? 'unknown' : p.ok ? 'on' : 'off'
        return (
          <li key={p.name} className={`pb-row is-${state}`} style={{ ['--pc' as string]: p.color, animationDelay: `${0.05 + i * 0.05}s` }}>
            <span className="pb-stub">
              <svg viewBox="0 0 64 40" className="pb-plug" aria-hidden>
                <rect x={40} y={6} width={20} height={28} rx={6} className="pb-socket" />
                <circle cx={50} cy={15} r={2.4} className="pb-hole" />
                <circle cx={50} cy={25} r={2.4} className="pb-hole" />
                <motion.g initial={{ x: -14 }} animate={{ x: state === 'on' ? 0 : -12, rotate: state === 'off' ? -14 : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.25 + i * 0.06 }} style={{ originX: '20px', originY: '20px' }}>
                  <path d="M2 20 C 8 20, 10 20, 18 20" className="pb-cord" />
                  <rect x={18} y={9} width={16} height={22} rx={5} className="pb-head" />
                  <rect x={34} y={13} width={7} height={3.5} rx={1.5} className="pb-pin" />
                  <rect x={34} y={23.5} width={7} height={3.5} rx={1.5} className="pb-pin" />
                </motion.g>
                {state === 'on' && (
                  <motion.g className="pb-spark" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 1.4] }} transition={{ duration: 0.6, delay: 0.5 + i * 0.06 }} style={{ originX: '40px', originY: '20px' }}>
                    <path d="M40 4 L40 0 M47 6 L50 2 M33 6 L30 2" />
                  </motion.g>
                )}
              </svg>
              <small>{state === 'on' ? 'Connected' : state === 'off' ? 'Not connected' : 'Unknown'}</small>
            </span>
            <span className="pb-copy">
              <b>{p.name}</b>
              <span>{p.what}</span>
            </span>
            <span className="pb-end">
              {p.detail && <code>{p.detail}</code>}
              {p.action}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Stages ---------- */

/** A small copy of the dashboard that follows the appearance settings as they change. */
function MiniDash({ p, dark }: { p: Prefs; dark: boolean }) {
  const gap = p.density === 'compact' ? 5 : 9
  const text = p.textSize === 'sm' ? 0.8 : p.textSize === 'lg' ? 1.25 : 1
  return (
    <div className={`s-mini ${dark ? 'is-dark' : ''}`} style={{ ['--a' as string]: `var(--${p.accent})`, ['--g' as string]: `${gap}px`, ['--t' as string]: text }}>
      <motion.div className="s-mini__side" animate={{ width: p.sideCollapsed ? 30 : 88 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
        <span className="s-mini__brand" />
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`s-mini__nav ${n === 1 ? 'is-on' : ''}`}>
            <i style={{ background: ['var(--violet)', 'var(--orange)', 'var(--blue)', 'var(--green)', 'var(--yellow)', 'var(--green)'][n] }} />
            {!p.sideCollapsed && <b />}
          </span>
        ))}
        {p.slotMeter && !p.sideCollapsed && <span className="s-mini__meter" />}
      </motion.div>
      <div className="s-mini__sheet">
        <motion.div className="s-mini__page" animate={{ maxWidth: p.layoutWidth === 'wide' ? '100%' : '82%' }} transition={{ duration: 0.5, ease: EASE }}>
          <div className="s-mini__head">
            <i />
            <span>
              <b style={{ width: `${46 * text}%` }} />
              <em style={{ width: `${70 * text}%` }} />
            </span>
          </div>
          <div className="s-mini__kpis">{[0, 1, 2, 3].map((n) => <span key={n}><b style={{ background: ['var(--green)', 'var(--orange)', 'var(--blue)', 'var(--violet)'][n] }} /></span>)}</div>
          <div className="s-mini__cards">
            <span className="is-big"><svg viewBox="0 0 60 30" preserveAspectRatio="none"><motion.path d="M0 26 L10 20 L20 23 L30 12 L40 15 L50 5 L60 8" fill="none" stroke="var(--a)" strokeWidth={2.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.2 }} key={p.accent} /></svg></span>
            <span><i /></span>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

/** A dot walking a trail at the chosen motion level, plus the chosen page switch on a loop. */
function MotionStage({ p }: { p: Prefs }) {
  const speed = p.motion === 'full' ? 3 : p.motion === 'calm' ? 7 : 0
  const [flip, setFlip] = useState(false)
  useEffect(() => {
    if (p.motion === 'off') return
    const id = window.setInterval(() => setFlip((f) => !f), 1800)
    return () => window.clearInterval(id)
  }, [p.motion])
  const t = p.motion === 'off' ? 'none' : p.pageTransition
  const v = {
    sweep: { initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: -30, opacity: 0 } },
    rise: { initial: { y: 20, opacity: 0, filter: 'blur(6px)' }, animate: { y: 0, opacity: 1, filter: 'blur(0px)' }, exit: { opacity: 0, filter: 'blur(4px)' } },
    slide: { initial: { x: 60, opacity: 0 }, animate: { x: 0, opacity: 1 }, exit: { x: -50, opacity: 0 } },
    none: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } },
  }[t]
  return (
    <div className="s-motion">
      <svg viewBox="0 0 300 90" className="s-motion__trail" aria-hidden>
        <path id="s-mtrail" d="M10 70 C 60 70, 70 20, 120 20 S 180 70, 230 60 S 280 20, 290 20" fill="none" stroke="var(--line)" strokeWidth={4} strokeDasharray="2 9" strokeLinecap="round" />
        {speed > 0 ? (
          <circle r={9} fill="var(--orange)">
            <animateMotion dur={`${speed}s`} repeatCount="indefinite" path="M10 70 C 60 70, 70 20, 120 20 S 180 70, 230 60 S 280 20, 290 20" />
          </circle>
        ) : (
          <circle r={9} cx={120} cy={20} fill="var(--orange)" />
        )}
      </svg>
      <div className="s-motion__screen">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={String(flip)} className="s-motion__page" style={{ background: flip ? 'var(--sky)' : 'var(--peach)' }} {...v} transition={{ duration: p.motion === 'calm' ? 0.3 : 0.5, ease: EASE }}>
            <Shape kind={flip ? 'circle' : 'tag'} color={flip ? 'var(--blue)' : 'var(--orange)'} glyph={flip ? 'flag' : 'signal'} size={34} play={false} />
            <span><b /><em /></span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

const SPOTS: { value: Prefs['toastPosition']; style: React.CSSProperties }[] = [
  { value: 'top-center', style: { top: 10, left: '50%', translate: '-50% 0' } },
  { value: 'top-right', style: { top: 10, right: 10 } },
  { value: 'bottom-left', style: { bottom: 10, left: 10 } },
  { value: 'bottom-center', style: { bottom: 10, left: '50%', translate: '-50% 0' } },
  { value: 'bottom-right', style: { bottom: 10, right: 10 } },
]

/** A pretend screen: click a spot to move toasts there, and see the toast in the chosen style. */
function ToastStage({ p, set }: { p: Prefs; set: (patch: Partial<Prefs>) => void }) {
  return (
    <div className="s-screen">
      <span className="s-screen__bar"><i /><i /><i /></span>
      {SPOTS.map((s) => {
        const on = p.toastPosition === s.value
        return (
          <button key={s.value} className={`s-screen__spot ${on ? 'is-on' : ''}`} style={s.style} onClick={() => set({ toastPosition: s.value })} aria-label={`Toasts ${s.value.replace('-', ' ')}`} data-cursor={on ? 'Toasts show here' : 'Show toasts here'}>
            {on ? (
              <motion.span layoutId="s-toast" className={`s-screen__toast is-${p.toastStyle}`} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
                <i />
                <span><b /><em /></span>
              </motion.span>
            ) : (
              <span className="s-screen__dot" />
            )}
          </button>
        )
      })}
      <span className="s-screen__caption">Click a spot to move toasts there</span>
    </div>
  )
}

/** Everything the dashboard talks to, as a small network: green lines are healthy. */
function NetStage({ nodes }: { nodes: { label: string; ok: boolean | null }[] }) {
  const cx = 160
  const cy = 110
  return (
    <svg viewBox="0 0 320 220" className="s-net" aria-hidden>
      {nodes.map((n, i) => {
        const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2
        const x = cx + Math.cos(a) * 112
        const y = cy + Math.sin(a) * 80
        const c = n.ok === null ? 'var(--dim)' : n.ok ? 'var(--green)' : 'var(--stop)'
        return (
          <g key={n.label}>
            <motion.line x1={cx} y1={cy} x2={x} y2={y} stroke={c} strokeWidth={3} strokeDasharray="4 6" initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeDashoffset: n.ok ? [0, -20] : 0 }} transition={{ pathLength: { duration: 0.6, delay: i * 0.08 }, strokeDashoffset: { duration: 1, repeat: Infinity, ease: 'linear' } }} />
            <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 + i * 0.08 }} style={{ transformOrigin: `${x}px ${y}px` }}>
              <circle cx={x} cy={y} r={9} fill={c} />
              <text x={x} y={y + (y > cy ? 26 : -16)} textAnchor="middle" className="s-net__label">{n.label}</text>
            </motion.g>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={24} fill="var(--solid)" />
      <motion.circle cx={cx} cy={cy} r={24} fill="none" stroke="var(--accent, var(--lime))" strokeWidth={3} animate={{ r: [24, 38], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity }} />
      <text x={cx} y={cy + 4} textAnchor="middle" className="s-net__core">you</text>
    </svg>
  )
}

function KeysStage({ on }: { on: boolean }) {
  return (
    <div className={`s-keys ${on ? '' : 'is-off'}`}>
      <div className="s-keys__row">
        <kbd className="s-key is-big">G</kbd>
        <span className="s-keys__then">then</span>
        <div className="s-keys__grid">
          {NAV.map((n, i) => (
            <motion.span key={n.to} className="s-keys__pair" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.04 }}>
              <kbd className="s-key">{n.key.toUpperCase()}</kbd>
              <Shape kind={n.kind} color={n.color} glyph={n.glyph} size={18} play={false} />
              <span>{n.label}</span>
            </motion.span>
          ))}
        </div>
      </div>
      <div className="s-keys__row is-small">
        <span><kbd className="s-key">/</kbd> search</span>
        <span><kbd className="s-key">R</kbd> refresh</span>
        <span><kbd className="s-key">,</kbd> settings</span>
        <span><kbd className="s-key">?</kbd> help</span>
      </div>
    </div>
  )
}

/* Little pictures for the choice cards */
const Lines = ({ n, gap, w = 1 }: { n: number; gap: number; w?: number }) => (
  <span className="s-art-lines" style={{ gap }}>{Array.from({ length: n }, (_, i) => <i key={i} style={{ height: 5 * w, width: `${90 - i * 14}%` }} />)}</span>
)

/* ---------- Page ---------- */

export default function Settings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const p = usePrefs()
  const set = (patch: Partial<Prefs>) => setPrefs(patch)
  const [theme, setTheme] = useTheme()
  const { engine, setEngine, health, config, offline, recheck, checking } = useDash()
  const [query, setQuery] = useState('')
  const location = useLocation()
  const [active, setActive] = useState(location.hash.slice(1) || 'appearance')
  const prevIdx = useRef(0)
  const [perm, setPerm] = useState<string>(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)

  useEffect(() => {
    const id = location.hash.slice(1)
    if (id) setActive(id)
  }, [location.hash])

  const askNotify = async () => {
    if (typeof Notification === 'undefined') return
    const r = await Notification.requestPermission()
    setPerm(r)
    if (r === 'granted') {
      set({ desktopNotify: true })
      notify.ok('Desktop notifications on', 'Finished jobs will ping you while this tab is in the background.')
    } else notify.warn('Notifications blocked', 'Allow them for this site in the browser to turn this on.')
  }
  const exportPrefs = () => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'trailhead-settings.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importPrefs = (file: File | undefined) => {
    if (!file) return
    file.text().then((t) => {
      const clean = sanitize(JSON.parse(t))
      setPrefs(clean)
      notify.ok('Settings imported', `${Object.keys(clean).length} settings applied.`)
    }).catch((e) => notify.error('Could not read that file', errorText(e)))
  }
  const clearLocal = () => {
    try {
      ;['th-repo', 'th-engine', 'th-asks', 'th-tours'].forEach((k) => localStorage.removeItem(k))
      notify.ok('Local data cleared', 'Cached choices on this device were removed.')
    } catch {
      notify.error('Storage is blocked in this browser')
    }
  }
  const clearHistory = async () => {
    if (!window.confirm('Delete every saved ask and tour? This cannot be undone.')) return
    try {
      await clearSaved()
      notify.ok('History deleted')
    } catch (e) {
      notify.error('Could not delete history', errorText(e))
    }
  }

  const engines = health?.engines ?? ['jev', 'llm', 'local']
  const origin = shareOrigin()
  const sw = (label: string, key: keyof Prefs, keys: string, hint?: string): Item => ({ label, hint, keys, on: p[key] as boolean, set: (v) => set({ [key]: v } as Partial<Prefs>) })

  const sections: Section[] = [
    {
      id: 'appearance', title: 'Appearance', blurb: 'Colour, size and layout', kind: 'circle', color: 'var(--violet)', glyph: 'pine',
      stage: <MiniDash p={p} dark={theme === 'dark'} />,
      items: [
        {
          label: 'Theme', keys: 'dark light theme', wide: true, control: (
            <Choice name="theme" value={theme} onChange={setTheme} cols={2} options={[
              { value: 'light', label: 'Light', hint: 'Warm paper', art: <span className="s-art-theme is-light"><i /><b /></span> },
              { value: 'dark', label: 'Dark', hint: 'Night trail', art: <span className="s-art-theme is-dark"><i /><b /></span> },
            ]} />
          ),
        },
        {
          label: 'Accent colour', hint: 'The active page, highlights and selections.', keys: 'accent colour color', wide: true, control: (
            <div className="s-swatches" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button key={a} role="radio" aria-checked={p.accent === a} className={p.accent === a ? 'is-on' : ''} onClick={() => set({ accent: a })} aria-label={a} data-cursor={`Use ${a}`}>
                  <span className="s-swatches__chip" style={{ background: `var(--${a})` }}>
                    {p.accent === a && <motion.span layoutId="s-swatch" className="s-swatches__ring" transition={{ type: 'spring', stiffness: 420, damping: 30 }} />}
                  </span>
                  <span className="s-swatches__name">{a}</span>
                </button>
              ))}
            </div>
          ),
        },
        {
          label: 'Density', keys: 'density compact spacing', control: (
            <Choice name="density" value={p.density} onChange={(v) => set({ density: v })} options={[
              { value: 'comfortable', label: 'Roomy', art: <Lines n={3} gap={7} /> },
              { value: 'compact', label: 'Compact', art: <Lines n={4} gap={3} /> },
            ]} />
          ),
        },
        {
          label: 'Text size', keys: 'text size font', control: (
            <Choice name="text" value={p.textSize} onChange={(v) => set({ textSize: v })} options={[
              { value: 'sm', label: 'Small', art: <span className="s-art-aa" style={{ fontSize: 18 }}>Aa</span> },
              { value: 'md', label: 'Default', art: <span className="s-art-aa" style={{ fontSize: 26 }}>Aa</span> },
              { value: 'lg', label: 'Large', art: <span className="s-art-aa" style={{ fontSize: 34 }}>Aa</span> },
            ]} />
          ),
        },
        {
          label: 'Page width', keys: 'width wide layout', control: (
            <Choice name="width" value={p.layoutWidth} onChange={(v) => set({ layoutWidth: v })} options={[
              { value: 'contained', label: 'Contained', art: <span className="s-art-width"><i style={{ width: '60%' }} /></span> },
              { value: 'wide', label: 'Wide', art: <span className="s-art-width"><i style={{ width: '94%' }} /></span> },
            ]} />
          ),
        },
        {
          label: 'Clock', keys: 'time clock 24h 12h', control: (
            <Choice name="clock" value={p.timeFormat} onChange={(v) => set({ timeFormat: v })} options={[
              { value: '12h', label: '12-hour', art: <span className="s-art-aa mono" style={{ fontSize: 17 }}>2:30 pm</span> },
              { value: '24h', label: '24-hour', art: <span className="s-art-aa mono" style={{ fontSize: 17 }}>14:30</span> },
            ]} />
          ),
        },
        sw('Collapsed sidebar', 'sideCollapsed', 'sidebar collapse', 'Icons only'),
        sw('Story shapes', 'sidebarStory', 'sidebar shapes story', 'The row of shapes in the sidebar'),
        sw('Jev slot meter', 'slotMeter', 'slot meter jev', 'Countdown to the next free request'),
        sw('Greet me by name', 'greetByName', 'greeting name', 'On the overview'),
      ],
    },
    {
      id: 'motion', title: 'Motion', blurb: 'Animation and the cursor', kind: 'tag', color: 'var(--orange)', glyph: 'signal',
      stage: <MotionStage p={p} />,
      items: [
        {
          label: 'How much motion', keys: 'motion animation reduce', wide: true, control: (
            <Choice name="motion" value={p.motion} onChange={(v) => set({ motion: v })} cols={3} options={[
              { value: 'full', label: 'Full', hint: 'Everything moves', art: <span className="s-art-bounce"><motion.i animate={{ y: [0, -14, 0] }} transition={{ duration: 0.9, repeat: Infinity }} /></span> },
              { value: 'calm', label: 'Calm', hint: 'Short and soft', art: <span className="s-art-bounce"><motion.i animate={{ y: [0, -5, 0] }} transition={{ duration: 1.8, repeat: Infinity }} /></span> },
              { value: 'off', label: 'Off', hint: 'Nothing moves', art: <span className="s-art-bounce"><i /></span> },
            ]} />
          ),
        },
        {
          label: 'Page switch', keys: 'page transition sweep slide', wide: true, control: (
            <Choice name="transition" value={p.pageTransition} onChange={(v) => set({ pageTransition: v })} cols={4} options={[
              { value: 'sweep', label: 'Trail', hint: 'Follows the sidebar', art: <span className="s-art-dir">↕</span> },
              { value: 'rise', label: 'Rise', hint: 'Out of a soft blur', art: <span className="s-art-dir is-blur">◎</span> },
              { value: 'slide', label: 'Slide', hint: 'From the side', art: <span className="s-art-dir">↔</span> },
              { value: 'none', label: 'Instant', hint: 'No animation', art: <span className="s-art-dir">·</span> },
            ]} />
          ),
        },
        {
          label: 'Cursor', keys: 'cursor pointer', control: (
            <Choice name="cursor" value={p.cursor} onChange={(v) => set({ cursor: v })} options={[
              { value: 'trail', label: 'Trail', art: <span className="s-art-cursor is-trail" /> },
              { value: 'system', label: 'System', art: <span className="s-art-cursor">➤</span> },
            ]} />
          ),
        },
        sw('Intro on reload', 'dashIntro', 'intro reload loader start', 'Shapes fly into the sidebar when the dashboard loads'),
        sw('Smooth scrolling', 'smoothScroll', 'smooth scroll lenis wheel', 'Eases the wheel and trackpad'),
        sw('Typing hints', 'typedHints', 'typing placeholder examples hints', 'Boxes type out example questions; Tab fills one in'),
        sw('Celebrations', 'celebrate', 'celebrate moment scene', 'Scenes for sign-in, sign-out and passkeys'),
        sw('Cursor labels', 'cursorLabels', 'cursor labels bubble', 'The bubble says what a click does'),
        sw('Click burst', 'cursorBurst', 'cursor burst click'),
        sw('Custom right-click menu', 'contextMenu', 'context menu right click', 'Shift + right-click opens the browser’s'),
      ],
    },
    {
      id: 'notifications', title: 'Notifications', blurb: 'Toasts and desktop pings', kind: 'square', color: 'var(--yellow)', glyph: 'flag',
      stage: <ToastStage p={p} set={set} />,
      items: [
        {
          label: 'Style', keys: 'toast style solid pastel', control: (
            <Choice name="toaststyle" value={p.toastStyle} onChange={(v) => set({ toastStyle: v })} options={[
              { value: 'pastel', label: 'Pastel', art: <span className="s-art-toast is-pastel"><i /><b /></span> },
              { value: 'solid', label: 'Solid', art: <span className="s-art-toast is-solid"><i /><b /></span> },
              { value: 'ink', label: 'Bold', art: <span className="s-art-toast is-ink"><i /><b /></span> },
              { value: 'paper', label: 'Paper', art: <span className="s-art-toast is-paper"><i /><b /></span> },
            ]} />
          ),
          wide: true,
        },
        {
          label: 'How they arrive', keys: 'toast entrance animation drop flip slide stamp', wide: true, control: (
            <Choice name="toastenter" value={p.toastEntrance} onChange={(v) => { set({ toastEntrance: v }); window.setTimeout(() => toast({ tone: 'info', title: `Arrives with a ${v}`, body: 'This is how new toasts come in.' }), 60) }} options={[
              { value: 'drop', label: 'Drop', hint: 'Falls in, tilted', art: <span className="s-art-dir">↓</span> },
              { value: 'flip', label: 'Flip', hint: 'Turns over', art: <span className="s-art-dir">⟲</span> },
              { value: 'slide', label: 'Slide', hint: 'From the edge', art: <span className="s-art-dir">→</span> },
              { value: 'stamp', label: 'Stamp', hint: 'Thumps down', art: <span className="s-art-dir">✦</span> },
            ]} />
          ),
        },
        {
          label: 'Size', keys: 'toast size compact roomy', control: (
            <Choice name="toastsize" value={p.toastSize} onChange={(v) => set({ toastSize: v })} options={[
              { value: 'compact', label: 'Compact', art: <Lines n={2} gap={3} /> },
              { value: 'roomy', label: 'Roomy', art: <Lines n={2} gap={8} /> },
            ]} />
          ),
        },
        { label: 'How many at once', hint: 'Older ones step aside for new ones.', keys: 'toast stack count max', control: <Slider value={p.toastStack} min={1} max={6} step={1} format={(v) => `${v}`} onChange={(v) => set({ toastStack: v })} label="Toasts at once" /> },
        sw('Icons', 'toastIcons', 'toast icon shape'),
        sw('Burning fuse', 'toastFuse', 'toast fuse timer bar', 'A line along the bottom that burns down'),
        sw('Hold while pointing', 'toastHoldOnHover', 'toast hover pause hold', 'A toast stays put while the pointer is on it'),
        sw('Soft chime', 'toastSound', 'toast sound chime audio', 'Two quiet notes when a toast arrives'),
        {
          label: 'New versions', hint: 'When the dashboard itself has been updated.', keys: 'update version new release reload', wide: true, control: (
            <Choice name="updatenotice" value={p.updateNotice} onChange={(v) => set({ updateNotice: v })} options={[
              { value: 'toast', label: 'Tell me', hint: 'A toast and a chip', art: <span className="s-art-dir">↻</span> },
              { value: 'quiet', label: 'Just the chip', hint: 'In the top bar', art: <span className="s-art-dir">·</span> },
              { value: 'auto', label: 'Update for me', hint: 'While the tab is hidden', art: <span className="s-art-dir">⇪</span> },
            ]} />
          ),
        },
        { label: 'How long they stay', keys: 'toast duration time', control: <Slider value={p.toastDuration} min={2} max={12} step={0.5} format={(v) => `${v}s`} onChange={(v) => set({ toastDuration: v })} label="Toast duration" /> },
        {
          label: 'Send a test', keys: 'test toast preview', control: (
            <div className="s-btns">
              <button className="d-chip" onClick={() => notify.ok('Looking good', 'This is a success toast.')}>Success</button>
              <button className="d-chip" onClick={() => toast({ tone: 'job', title: 'Tour ready · 5 stops', body: 'This is what a finished job looks like.' })}>Job</button>
              <button className="d-chip" onClick={() => notify.error('Something went wrong', 'This is an error toast.')}>Error</button>
            </div>
          ),
        },
        {
          label: 'Send a test (new looks)', keys: 'test toast warn info', control: (
            <div className="s-btns">
              <button className="d-chip" onClick={() => notify.info('Heads up', 'This is an info toast.')}>Info</button>
              <button className="d-chip" onClick={() => notify.warn('Careful there', 'This is a warning toast.')}>Warning</button>
            </div>
          ),
        },
        {
          label: 'Desktop notifications', hint: perm === 'denied' ? 'Blocked in this browser’s site settings.' : 'Only while the tab is in the background.', keys: 'desktop notification',
          ...(perm === 'granted' ? { on: p.desktopNotify, set: (v: boolean) => set({ desktopNotify: v }) } : { control: <button className="d-chip" onClick={askNotify} disabled={perm === 'denied' || perm === 'unsupported'}>{perm === 'unsupported' ? 'Not supported' : 'Allow…'}</button> }),
        },
        sw('Success messages', 'toastSuccess', 'toast success'),
        sw('Errors', 'toastErrors', 'toast error'),
        sw('Finished jobs', 'toastJobs', 'toast jobs done', 'Answers, tours and finds'),
      ],
    },
    {
      id: 'engine', title: 'Engine', blurb: 'Who decides, and on what', kind: 'circle', color: 'var(--blue)', glyph: 'grep',
      stage: (
        <Choice name="engine" value={engine} onChange={setEngine} cols={1} options={engines.map((e) => ({
          value: e,
          label: e === 'jev' ? 'Jev' : e === 'llm' ? 'LLM fallback' : 'Local (Ollama)',
          hint: e === 'jev' ? `Calibrated decisions · ${config?.jev.model_id || '—'}` : e === 'llm' ? `Hosted model · ${config?.llm.configured ? config.llm.model : 'not configured'}` : `This machine · ${config?.local.model || '—'}`,
          art: <Shape kind={e === 'jev' ? 'tag' : e === 'llm' ? 'circle' : 'square'} color={e === 'jev' ? 'var(--orange)' : e === 'llm' ? 'var(--blue)' : 'var(--green)'} glyph={e === 'jev' ? 'signal' : e === 'llm' ? 'grep' : 'file'} size={38} play={engine === e} />,
        }))} />
      ),
      items: [
        { label: 'Reasoning effort', keys: 'reasoning effort', control: <span className="s-value mono">{config?.llm.reasoning_effort || '—'}</span> },
        { label: 'LLM falls back to', keys: 'llm fallback model', control: <span className="s-value mono">{config?.llm.fallback_model || '—'}</span> },
        {
          label: 'Start page', hint: 'Where signing in lands you.', keys: 'start page home', control: (
            <Select label="Start page" value={p.startPage} align="end" onChange={(v) => set({ startPage: v })} options={NAV.map((n) => ({ value: n.to, label: n.label, icon: <Shape kind={n.kind} color={n.color} glyph={n.glyph} size={18} play={false} /> }))} />
          ),
        },
        sw('Notes on tour stops', 'tourNotes', 'tour notes', 'A line on why each file matters'),
        sw('Save results automatically', 'autoSave', 'auto save history', 'Off: save asks and tours by hand'),
        sw('Example questions', 'askExamples', 'examples ask'),
      ],
    },
    {
      id: 'connections', title: 'Connections', blurb: 'What this dashboard talks to', kind: 'square', color: 'var(--green)', glyph: 'branch',
      stage: (
        <NetStage nodes={[
          { label: 'API', ok: offline ? false : true },
          ...(config?.jev.providers ?? []).slice(0, 2).map((pr) => ({ label: `Jev ${pr.name}`, ok: true })),
          { label: 'LLM', ok: config ? config.llm.configured : null },
          { label: 'Ollama', ok: config?.local.host ? true : null },
          { label: 'GitHub', ok: config ? config.github_token : null },
          { label: 'Supabase', ok: health ? health.auth === 'supabase' : null },
        ]} />
      ),
      body: (
        <Plugboard plugs={[
          { name: 'Trailhead API', what: offline ? 'Start it with bin/trailhead serve' : 'localhost:8000 through the dev proxy', ok: !offline, color: 'var(--lime)', action: <RefreshButton busy={checking} onClick={() => recheck()} label="Check" /> },
          ...(config?.jev.providers ?? []).map((pr) => ({ name: `Jev · ${pr.name}`, what: `${pr.host} · ${pr.rpm} requests a minute`, detail: pr.model, ok: true, color: 'var(--orange)' })),
          { name: 'LLM provider', what: config?.llm.host || 'Writes the prose for answers', detail: config?.llm.configured ? `${config.llm.rpm} rpm` : undefined, ok: config ? config.llm.configured : null, color: 'var(--blue)' },
          { name: 'Ollama', what: config?.local.host || 'A model on this machine, for bulk runs', ok: config ? !!config.local.host : null, color: 'var(--violet)' },
          { name: 'GitHub token', what: 'Higher rate limits for pull requests and issues', ok: config ? config.github_token : null, color: 'var(--yellow)' },
          { name: 'Sign-in', what: 'Accounts and saved history', detail: health?.auth, ok: health ? health.auth === 'supabase' : null, color: 'var(--green)' },
        ]} />
      ),
      items: [
        { label: 'Trailhead API', hint: offline ? 'Start it with bin/trailhead serve' : 'localhost:8000 through the dev proxy', keys: 'api server connection', control: <div className="s-btns">{offline && <Status ok={false}>offline</Status>}<RefreshButton busy={checking} onClick={() => recheck()} label="Check" /></div> },
        ...(config?.jev.providers ?? []).map((pr) => ({ label: `Jev · ${pr.name}`, hint: `${pr.host} · ${pr.rpm} requests/min`, keys: `jev provider ${pr.name}`, control: <span className="s-value mono">{pr.model}</span> })),
        { label: 'LLM provider', hint: config?.llm.host, keys: 'llm provider groq', control: <Status ok={config ? config.llm.configured : null}>{config?.llm.configured ? `${config.llm.rpm} rpm` : 'not set'}</Status> },
        { label: 'Ollama', hint: config?.local.host, keys: 'ollama local', control: <Status ok={null}>{config?.local.host ? 'configured' : '—'}</Status> },
        { label: 'GitHub token (server)', hint: 'Higher rate limits for pull requests and issues.', keys: 'github token server', control: <Status ok={config ? config.github_token : null}>{config?.github_token ? 'set' : 'not set'}</Status> },
        { label: 'Sign-in', hint: 'Accounts and saved history.', keys: 'supabase auth', control: <Status ok={health ? health.auth === 'supabase' : null}>{health?.auth ?? '—'}</Status> },
      ],
    },
    {
      id: 'sharing', title: 'Sharing', blurb: 'Links and QR codes', kind: 'tag', color: 'var(--violet)', glyph: 'pr',
      stage: (
        <div className="s-link">
          <span className="s-link__url mono">{origin}/s#<b>answer…</b></span>
          <div className="s-link__qr" aria-hidden>{Array.from({ length: 49 }, (_, i) => <i key={i} style={{ opacity: (i * 7919) % 3 ? 1 : 0.08 }} />)}</div>
          <span className="d-muted">{isLocalOrigin(origin) ? 'localhost only opens on this computer. Add your LAN address so a phone can scan it.' : 'Phones on the same network can open these.'}</span>
        </div>
      ),
      items: [
        { label: 'Address for share links', hint: 'For example http://192.168.1.20:5173', keys: 'share link qr lan address', wide: true, control: <input className="field s-input mono" placeholder={window.location.origin} value={p.shareBase} onChange={(e) => set({ shareBase: e.target.value.trim() })} aria-label="Share link address" /> },
      ],
    },
    {
      id: 'behaviour', title: 'Shortcuts', blurb: 'Keyboard and safety nets', kind: 'square', color: 'var(--orange)', glyph: 'check',
      stage: <KeysStage on={p.shortcuts} />,
      items: [sw('Keyboard shortcuts', 'shortcuts', 'keyboard shortcuts keys'), sw('Confirm before signing out', 'confirmSignOut', 'confirm sign out')],
    },
    {
      id: 'data', title: 'Data & sync', blurb: 'Move or start fresh', kind: 'circle', color: 'var(--green)', glyph: 'file',
      stage: (
        <div className="s-sync">
          <div className="s-sync__dev"><span>This browser</span></div>
          <svg viewBox="0 0 120 30" aria-hidden>
            <motion.path d="M4 15 H116" stroke={p.syncToAccount ? 'var(--green)' : 'var(--dim)'} strokeWidth={4} strokeDasharray="4 8" strokeLinecap="round" fill="none" animate={p.syncToAccount ? { strokeDashoffset: [0, -24] } : { strokeDashoffset: 0 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
          </svg>
          <div className={`s-sync__dev ${p.syncToAccount ? 'is-on' : ''}`}><span>Your account</span></div>
          <span className="s-sync__note">{p.syncToAccount ? 'Settings follow you to every device' : 'Settings stay on this browser'}</span>
        </div>
      ),
      items: [
        sw('Sync settings to my account', 'syncToAccount', 'sync account cloud', 'Needs migration 0002 in Supabase'),
        {
          label: 'Export or import', keys: 'export import json backup', control: (
            <div className="s-btns">
              <button className="d-chip" onClick={exportPrefs}>Export</button>
              <label className="d-chip" data-cursor="Pick a file">Import<input type="file" accept="application/json" hidden onChange={(e) => importPrefs(e.target.files?.[0])} /></label>
            </div>
          ),
        },
        { label: 'Welcome steps', hint: 'Walk through the first-run setup again.', keys: 'onboarding welcome replay setup', control: <button className="d-chip" onClick={async () => { await resetOnboarded(user); navigate('/welcome') }}>Replay</button> },
        { label: 'Clear local data', hint: 'Remembered repository and engine.', keys: 'clear local cache', control: <button className="d-chip" onClick={clearLocal}>Clear</button> },
        { label: 'Delete saved history', hint: 'Every ask and tour, on every device.', keys: 'delete history asks tours', control: <button className="d-chip is-danger" onClick={clearHistory}>Delete…</button> },
        { label: 'Reset all settings', keys: 'reset defaults', control: <button className="d-chip is-danger" onClick={() => { resetPrefs(); notify.info('Settings reset', `${Object.keys(DEFAULTS).length} settings back to their defaults.`) }}>Reset</button> },
      ],
    },
  ]

  const qq = query.trim().toLowerCase()
  const hits = useMemo(
    () => (qq ? sections.flatMap((s) => s.items.filter((it) => `${s.title} ${it.label} ${it.hint ?? ''} ${it.keys}`.toLowerCase().includes(qq)).map((it) => ({ ...it, section: s }))) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [qq, p, theme, engine, config, health, offline, perm, checking],
  )
  const idx = Math.max(0, sections.findIndex((s) => s.id === active))
  const sec = sections[idx]
  const dir = idx >= prevIdx.current ? 1 : -1
  useEffect(() => {
    prevIdx.current = idx
  }, [idx])

  return (
    <div className="d-body">
      <PageHead
        kicker="Preferences"
        title="Make it"
        oblique="yours"
        note="Everything applies the moment you change it. Your account and sign-in live in Profile."
        actions={
          <label className="s-search">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><circle cx={11} cy={11} r={7} /><path d="M20 20l-3.5-3.5" /></svg>
            <input placeholder="Search settings" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search settings" />
            {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
          </label>
        }
      />

      <nav className="s-tabs" aria-label="Settings sections">
        {sections.map((s, i) => {
          const on = !qq && s.id === sec.id
          return (
            <motion.button key={s.id} className={`s-tab ${on ? 'is-on' : ''}`} onClick={() => { setQuery(''); setActive(s.id); window.history.replaceState(null, '', `#${s.id}`) }} style={{ ['--c' as string]: s.color }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.035, duration: 0.45, ease: EASE }} whileHover={{ y: -3 }} data-cursor={on ? 'Open' : s.title}>
              {on && <motion.span layoutId="s-tab" className="s-tab__bg" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
              <motion.span className="s-tab__icon" animate={{ rotate: on ? -8 : 0, scale: on ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
                <Shape kind={s.kind} color={s.color} glyph={s.glyph} size={34} play={on} />
              </motion.span>
              <span className="s-tab__text">
                <b>{s.title}</b>
                <span>{s.blurb}</span>
              </span>
            </motion.button>
          )
        })}
      </nav>

      {qq ? (
        <section className="s-results">
          <h2 className="chunk s-results__title">{hits.length ? `${hits.length} setting${hits.length === 1 ? '' : 's'} match “${query}”` : `Nothing matches “${query}”`}</h2>
          <div className="s-grid">
            {hits.map((it, i) => (
              <div key={`${it.section.id}-${it.label}`} className={`s-hit ${it.wide ? 'is-wide' : ''}`}>
                <button className="s-hit__from" onClick={() => { setQuery(''); setActive(it.section.id) }}>
                  <Shape kind={it.section.kind} color={it.section.color} glyph={it.section.glyph} size={16} play={false} />
                  {it.section.title}
                </button>
                <Tile item={it} i={i} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.section
            key={sec.id}
            className="s-panel"
            style={{ ['--c' as string]: sec.color }}
            custom={dir}
            variants={{ in: (d: number) => ({ opacity: 0, x: 40 * d }), on: { opacity: 1, x: 0 }, out: (d: number) => ({ opacity: 0, x: -30 * d }) }}
            initial="in"
            animate="on"
            exit="out"
            transition={{ duration: 0.35, ease: EASE }}
          >
            <div className="s-stage">
              <div className="s-stage__head">
                <Shape kind={sec.kind} color={sec.color} glyph={sec.glyph} size={44} />
                <div>
                  <h2 className="chunk">{sec.title}</h2>
                  <span>{sec.blurb}</span>
                </div>
              </div>
              <div className="s-stage__show">{sec.stage}</div>
            </div>
            {sec.body ?? (
              <div className="s-grid">
                {sec.items.map((it, i) => <Tile key={it.label} item={it} i={i} />)}
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      )}
    </div>
  )
}
