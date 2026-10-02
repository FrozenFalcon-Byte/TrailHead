import '@fontsource/caveat/600.css'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { setPrefs, usePrefs, type Prefs } from '../lib/prefs'
import { Toggle } from '../motion/Select'

/* The trail pass on the profile page can be dressed up: its colour, its outline (a ticket with a torn stub, a
   trail-sign tag or a plain card), the lettering of the name, the photo's frame, which side the stub sits on, the
   label at the top, and which parts show. The pass swings down on a hinge when it appears, and the choices live in
   the profile's "Your pass" tab, with the pass above as the live preview. Choices are ordinary settings, so they sync too. */

const COLORS: Prefs['passColor'][] = ['yellow', 'orange', 'violet', 'blue', 'green', 'lime']
const PASTEL: Record<Prefs['passColor'], string> = { yellow: 'var(--butter)', orange: 'var(--peach)', violet: 'var(--lilac)', blue: 'var(--sky)', green: 'var(--mint)', lime: 'var(--limeade)' }
const INK: Record<Prefs['passColor'], string> = { yellow: 'var(--solid)', orange: '#fff', violet: '#fff', blue: '#fff', green: '#fff', lime: 'var(--solid)' }
export const PASS_LABEL = 'Trail pass'

export function PassFrame({ children }: { children: ReactNode }) {
  const p = usePrefs()
  const reduce = useReducedMotion()
  const cls = ['p-pass', `is-${p.passShape}`, `font-${p.passFont}`, p.passStub === 'right' ? 'is-flip' : '', p.passStamps ? '' : 'no-stamps'].join(' ')
  return (
    <motion.div className="p-pass-wrap" initial={reduce ? false : { rotateX: -22, y: -8 }} animate={{ rotateX: 0, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 15 }} style={{ transformOrigin: '50% 0%', transformPerspective: 1200 }}>
      <section className={cls}
        style={{ ['--pass' as string]: `var(--${p.passColor})`, ['--pass-bg' as string]: PASTEL[p.passColor], ['--pass-ink' as string]: INK[p.passColor] }}>
        {children}
      </section>
    </motion.div>
  )
}

/** A row of choices with a lime pill that slides to the picked one. */
function Pick<T extends string>({ id, value, options, onPick }: { id: string; value: T; options: { v: T; label: string; art?: ReactNode }[]; onPick: (v: T) => void }) {
  return (
    <div className="p-cust__pick" role="radiogroup" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} className={value === o.v ? 'is-on' : ''} onClick={() => onPick(o.v)}>
          {value === o.v && <motion.span layoutId={`p-cust-${id}`} className="p-cust__pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
          {o.art}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

const SHAPES: { v: Prefs['passShape']; label: string; art: ReactNode }[] = [
  { v: 'ticket', label: 'Ticket', art: <svg viewBox="0 0 44 22" width={40} height={20} aria-hidden><rect x={1} y={1} width={42} height={20} rx={5} fill="none" stroke="currentColor" strokeWidth={2} /><path d="M13 2v18" stroke="currentColor" strokeWidth={2} strokeDasharray="2 3" /></svg> },
  { v: 'tag', label: 'Trail tag', art: <svg viewBox="0 0 44 22" width={40} height={20} aria-hidden><path d="M5 1h28l10 10-10 10H5a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" fill="none" stroke="currentColor" strokeWidth={2} /></svg> },
  { v: 'card', label: 'Card', art: <svg viewBox="0 0 44 22" width={40} height={20} aria-hidden><rect x={1} y={1} width={42} height={20} rx={8} fill="none" stroke="currentColor" strokeWidth={2} /></svg> },
]
const FONTS: { v: Prefs['passFont']; label: string; art: ReactNode }[] = [
  { v: 'bold', label: 'Bold', art: <b className="p-cust__aa font-bold">Aa</b> },
  { v: 'clean', label: 'Clean', art: <b className="p-cust__aa font-clean">Aa</b> },
  { v: 'mono', label: 'Mono', art: <b className="p-cust__aa font-mono">Aa</b> },
  { v: 'hand', label: 'Hand', art: <b className="p-cust__aa font-hand">Aa</b> },
]
const FRAMES: { v: Prefs['passFrame']; label: string; art: ReactNode }[] = [
  { v: 'compass', label: 'Compass', art: <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden><circle cx={12} cy={12} r={10.5} fill="none" stroke="currentColor" strokeWidth={1.6} strokeDasharray="1.4 2" /><circle cx={12} cy={12} r={6.5} fill="currentColor" /></svg> },
  { v: 'circle', label: 'Circle', art: <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden><circle cx={12} cy={12} r={8} fill="currentColor" /></svg> },
  { v: 'square', label: 'Square', art: <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden><rect x={4} y={4} width={16} height={16} rx={4.5} fill="currentColor" /></svg> },
]
const SIDES: { v: Prefs['passStub']; label: string; art: ReactNode }[] = [
  { v: 'left', label: 'Left', art: <svg viewBox="0 0 34 18" width={32} height={17} aria-hidden><rect x={1} y={1} width={32} height={16} rx={4} fill="none" stroke="currentColor" strokeWidth={1.8} /><rect x={1} y={1} width={11} height={16} rx={4} fill="currentColor" /></svg> },
  { v: 'right', label: 'Right', art: <svg viewBox="0 0 34 18" width={32} height={17} aria-hidden><rect x={1} y={1} width={32} height={16} rx={4} fill="none" stroke="currentColor" strokeWidth={1.8} /><rect x={22} y={1} width={11} height={16} rx={4} fill="currentColor" /></svg> },
]
const SHOWS: { key: 'passHeadline' | 'passDetails' | 'passEmail' | 'passStats' | 'passStamps' | 'passTrail'; label: string }[] = [
  { key: 'passHeadline', label: 'Headline' },
  { key: 'passDetails', label: 'Details' },
  { key: 'passEmail', label: 'Email' },
  { key: 'passStats', label: 'Stats' },
  { key: 'passStamps', label: 'Stamps' },
  { key: 'passTrail', label: 'Trail line' },
]

/** The "Your pass" tab on the profile page. The pass above it is the live preview. */
export function PassPanel() {
  const p = usePrefs()
  const reset = () => setPrefs({ passColor: 'yellow', passShape: 'ticket', passFont: 'bold', passFrame: 'compass', passStub: 'left', passLabel: '', passHeadline: true, passDetails: true, passEmail: true, passStats: true, passStamps: true, passTrail: true })
  return (
    <div className="p-grid p-cust">
      <div className="p-card p-cust__card">
        <h3 className="chunk">Colour and shape</h3>
        <span className="d-muted">The stub takes the colour; the pass takes its pastel.</span>
        <span className="p-cust__label">Colour</span>
        <div className="p-cust__swatches" role="radiogroup" aria-label="Pass colour">
          {COLORS.map((c, i) => (
            <motion.button key={c} role="radio" aria-checked={p.passColor === c} aria-label={c} className={p.passColor === c ? 'is-on' : ''} onClick={() => setPrefs({ passColor: c })}
              initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 360, damping: 15, delay: 0.05 + i * 0.03 }} whileHover={{ y: -3, rotate: -8 }} whileTap={{ scale: 0.85 }}
              style={{ background: `var(--${c})` }}>
              {p.passColor === c && <motion.span layoutId="p-cust-ring" className="p-cust__ring" transition={{ type: 'spring', stiffness: 420, damping: 28 }} />}
            </motion.button>
          ))}
        </div>
        <span className="p-cust__label">Shape</span>
        <Pick id="shape" value={p.passShape} options={SHAPES} onPick={(v) => setPrefs({ passShape: v })} />
        <span className="p-cust__label">Stub side</span>
        <Pick id="side" value={p.passStub} options={SIDES} onPick={(v) => setPrefs({ passStub: v })} />
      </div>
      <div className="p-card p-cust__card">
        <h3 className="chunk">Name and photo</h3>
        <span className="d-muted">How your name is lettered and how your photo is framed.</span>
        <span className="p-cust__label">Name lettering</span>
        <Pick id="font" value={p.passFont} options={FONTS} onPick={(v) => setPrefs({ passFont: v })} />
        <span className="p-cust__label">Photo frame</span>
        <Pick id="frame" value={p.passFrame} options={FRAMES} onPick={(v) => setPrefs({ passFrame: v })} />
        <span className="p-cust__label">Label</span>
        <input className="field p-cust__input" value={p.passLabel} maxLength={24} placeholder={PASS_LABEL} onChange={(e) => setPrefs({ passLabel: e.target.value })} aria-label="Pass label" />
      </div>
      <div className="p-card p-cust__card is-wide">
        <div className="p-card__head">
          <div><h3 className="chunk">What the pass shows</h3><span className="d-muted">Hidden parts fold away; your details stay saved.</span></div>
          <button className="d-chip" onClick={reset}>Back to the original</button>
        </div>
        <div className="p-cust__toggles">
          {SHOWS.map((s) => (
            <label key={s.key}><span>{s.label}</span><Toggle on={p[s.key]} onChange={(v) => setPrefs({ [s.key]: v })} label={`Show ${s.label.toLowerCase()}`} /></label>
          ))}
        </div>
      </div>
    </div>
  )
}
