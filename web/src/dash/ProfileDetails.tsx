import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'
import { TrailSpinner } from '../motion/TrailSpinner'

/* Profile details as something to play with rather than a form: a headline you build from flip cards (or roll
   dice for), a location pin that drops when you set it, a website that checks itself as you type, and a bio
   with conversation starters. The trail pass above the tabs mirrors every change live. */

export type DetailsForm = { display_name: string; headline: string; location: string; website: string; bio: string }

const ROLES = ['Backend engineer', 'Student', 'Maintainer', 'Data scientist', 'Frontend developer', 'SRE', 'Hobbyist', 'Designer who codes']
const VERBS = ['exploring', 'learning', 'contributing to', 'fixing bugs in', 'reviewing', 'mapping']
const THINGS = ['open source', 'this codebase', 'my first pull request', 'legacy code', 'the scheduler', 'crawlers']
const STARTERS = ['Right now I am working on ', 'I want to learn ', 'Ask me about ', 'Outside code I ']

const pick = <T,>(xs: T[], not?: T) => {
  const pool = xs.filter((x) => x !== not)
  return pool[Math.floor(Math.random() * pool.length)]
}
const tzCity = () => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone.split('/').pop()?.replace(/_/g, ' ') ?? ''
  } catch {
    return ''
  }
}
const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function Section({ kind, color, glyph, title, hint, on, children, wide }: { kind: ShapeKind; color: string; glyph: Glyph; title: string; hint: string; on: boolean; children: React.ReactNode; wide?: boolean }) {
  return (
    <motion.section className={`pd-sec ${on ? 'is-on' : ''} ${wide ? 'is-wide' : ''}`} layout="position">
      <motion.span className="pd-sec__icon" animate={on ? { rotate: -10, scale: 1.12, y: -2 } : { rotate: 0, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16 }}>
        <Shape kind={kind} color={color} glyph={glyph} size={34} play={on} />
      </motion.span>
      <div className="pd-sec__body">
        <div className="pd-sec__title">
          <b>{title}</b>
          <span>{hint}</span>
        </div>
        {children}
      </div>
    </motion.section>
  )
}

/** A word on a flip card: click to turn it to the next option. */
function Flip({ value, onNext, disabled }: { value: string; onNext: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="pd-flip" onClick={onNext} disabled={disabled} data-cursor="Flip it">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ rotateX: -90, y: -10, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 1 }} exit={{ rotateX: 90, y: 10, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 26 }}>
          {value}
        </motion.span>
      </AnimatePresence>
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden><path d="M2 4.5L6 8l4-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
  )
}

function Dice({ onRoll, disabled }: { onRoll: () => void; disabled?: boolean }) {
  const [spin, setSpin] = useState(0)
  return (
    <motion.button type="button" className="pd-dice" onClick={() => { setSpin((s) => s + 1); onRoll() }} disabled={disabled} aria-label="Roll a random headline" data-cursor="Roll the dice" animate={{ rotate: spin * 360 }} whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
      <svg width={26} height={26} viewBox="0 0 26 26" aria-hidden>
        <rect x={2} y={2} width={22} height={22} rx={6} fill="var(--yellow)" stroke="var(--solid)" strokeWidth={2} />
        {[[8, 8], [18, 18], [13, 13], [18, 8], [8, 18]].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r={2} fill="var(--solid)" />)}
      </svg>
    </motion.button>
  )
}

export function ProfileDetails({ form, setForm, base, dirty, saving, onSave, nameLocked, extrasLocked, defaultName }: {
  form: DetailsForm
  setForm: (f: DetailsForm) => void
  base: DetailsForm
  dirty: boolean
  saving: boolean
  onSave: () => Promise<boolean>
  nameLocked?: boolean
  extrasLocked?: boolean
  defaultName?: string
}) {
  const [focus, setFocus] = useState('')
  const [own, setOwn] = useState(false)
  const [parts, setParts] = useState(() => ({ role: ROLES[0], verb: VERBS[0], thing: THINGS[0] }))
  const [stamped, setStamped] = useState(false)
  const bio = useRef<HTMLTextAreaElement>(null)
  const city = tzCity()
  const domain = domainOf(form.website)
  const needsScheme = !!form.website && !/^https?:\/\//i.test(form.website)
  const pinKey = form.location.trim()

  // A headline that came from the cards keeps them in sync; anything else counts as written by hand.
  useEffect(() => {
    if (!form.headline) return
    const r = ROLES.find((x) => form.headline.startsWith(x + ' '))
    const v = r && VERBS.find((x) => form.headline.slice(r.length + 1).startsWith(x + ' '))
    const t = r && v && THINGS.find((x) => form.headline === `${r} ${v} ${x}`)
    if (r && v && t) setParts({ role: r, verb: v, thing: t })
    else setOwn(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.headline])

  const setPart = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch }
    setParts(next)
    setForm({ ...form, headline: `${next.role} ${next.verb} ${next.thing}` })
  }
  const next = (xs: string[], cur: string) => xs[(xs.indexOf(cur) + 1) % xs.length]
  const on = (id: string) => ({ onFocus: () => setFocus(id), onBlur: () => setFocus((f) => (f === id ? '' : f)) })
  const field = (k: keyof DetailsForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })
  const bioFill = Math.min(1, form.bio.length / 400)

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (await onSave()) {
      setStamped(true)
      setTimeout(() => setStamped(false), 1800)
    }
  }

  return (
    <form className="p-card pd" onSubmit={save}>
      <div className="pd-grid">
        <Section kind="circle" color="var(--violet)" glyph="flag" title="Your name" hint="How Trailhead greets you" on={focus === 'name'}>
          <div className="pd-name">
            <span className="pd-name__hi">Hi, I am</span>
            <input className="pd-name__input" value={form.display_name} onChange={field('display_name')} maxLength={80} placeholder={defaultName || 'Your name'} disabled={nameLocked} aria-label="Display name" {...on('name')} />
          </div>
          {defaultName && form.display_name !== defaultName && !nameLocked && (
            <button type="button" className="d-chip pd-chip" onClick={() => setForm({ ...form, display_name: defaultName })}>Use “{defaultName}”</button>
          )}
        </Section>

        <Section kind="circle" color="var(--green)" glyph="pine" title="Location" hint="Where you hike from" on={focus === 'location'}>
          <div className="pd-pin">
            <span className="pd-pin__mark" aria-hidden>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.svg key={pinKey ? 'set' : 'empty'} width={26} height={32} viewBox="0 0 26 32" initial={{ y: -26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
                  <path d="M13 31C13 31 24 19.5 24 12A11 11 0 0 0 2 12C2 19.5 13 31 13 31Z" fill={pinKey ? 'var(--orange)' : 'none'} stroke="var(--solid)" strokeWidth={2} strokeDasharray={pinKey ? undefined : '3 3'} />
                  <circle cx={13} cy={12} r={4} fill={pinKey ? 'var(--paper)' : 'none'} stroke="var(--solid)" strokeWidth={pinKey ? 0 : 1.5} />
                </motion.svg>
              </AnimatePresence>
              <motion.i animate={{ scaleX: pinKey ? 1 : 0.5, opacity: pinKey ? 0.35 : 0.15 }} />
            </span>
            <input className="field" value={form.location} onChange={field('location')} maxLength={80} placeholder="City, country" disabled={extrasLocked} aria-label="Location" {...on('location')} />
          </div>
          {city && form.location !== city && !extrasLocked && (
            <button type="button" className="d-chip pd-chip" onClick={() => setForm({ ...form, location: city })}>
              Use my time zone · {city}
            </button>
          )}
        </Section>

        <Section kind="tag" color="var(--orange)" glyph="signal" title="Headline" hint={own ? 'Written by you' : 'Flip the cards, or roll the dice'} on={focus === 'headline'} wide>
          {own ? (
            <input className="field" value={form.headline} onChange={field('headline')} maxLength={100} placeholder="Backend engineer, new to Scrapy" disabled={extrasLocked} aria-label="Headline" {...on('headline')} />
          ) : (
            <div className="pd-lib" onFocus={() => setFocus('headline')} onBlur={() => setFocus('')}>
              <Flip value={parts.role} onNext={() => setPart({ role: next(ROLES, parts.role) })} disabled={extrasLocked} />
              <Flip value={parts.verb} onNext={() => setPart({ verb: next(VERBS, parts.verb) })} disabled={extrasLocked} />
              <Flip value={parts.thing} onNext={() => setPart({ thing: next(THINGS, parts.thing) })} disabled={extrasLocked} />
              <Dice onRoll={() => setPart({ role: pick(ROLES, parts.role), verb: pick(VERBS, parts.verb), thing: pick(THINGS, parts.thing) })} disabled={extrasLocked} />
            </div>
          )}
          <button type="button" className="pd-link" onClick={() => { setOwn(!own); if (own) setPart({}) }} disabled={extrasLocked}>{own ? 'Build it from cards instead' : 'Write my own'}</button>
        </Section>

        <Section kind="square" color="var(--blue)" glyph="file" title="Website" hint="Your corner of the internet" on={focus === 'website'}>
          <input className="field" value={form.website} onChange={field('website')} maxLength={200} placeholder="https://" disabled={extrasLocked} aria-label="Website" inputMode="url" {...on('website')} />
          <AnimatePresence mode="wait" initial={false}>
            {needsScheme ? (
              <motion.button key="fix" type="button" className="d-chip pd-chip is-warn" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} onClick={() => setForm({ ...form, website: `https://${form.website.replace(/^\/+/, '')}` })}>
                Add https:// in front
              </motion.button>
            ) : domain ? (
              <motion.span key={domain} className="pd-domain" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
                <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden><circle cx={8} cy={8} r={8} fill="var(--green)" /><motion.path d="M4.5 8.3l2.2 2.2 4.8-5" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.1, duration: 0.3 }} /></svg>
                {domain}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </Section>

        <Section kind="square" color="var(--yellow)" glyph="pr" title="Bio" hint="A few lines for whoever reads your pass" on={focus === 'bio'}>
          <div className="pd-starters">
            {STARTERS.map((st, i) => (
              <motion.button
                key={st}
                type="button"
                className="pd-starter"
                disabled={extrasLocked}
                whileHover={{ y: -3, rotate: i % 2 ? 2 : -2 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => {
                  const sep = form.bio && !/\s$/.test(form.bio) ? (/[.!?]$/.test(form.bio) ? ' ' : '. ') : ''
                  setForm({ ...form, bio: (form.bio + sep + st).slice(0, 400) })
                  requestAnimationFrame(() => {
                    const el = bio.current
                    if (el) {
                      el.focus()
                      el.setSelectionRange(el.value.length, el.value.length)
                    }
                  })
                }}
              >
                + {st.trim()}…
              </motion.button>
            ))}
          </div>
          <div className="pd-bio">
            <textarea ref={bio} className="field" value={form.bio} onChange={field('bio')} maxLength={400} placeholder="What you are working on, what you want to learn." disabled={extrasLocked} aria-label="Bio" {...on('bio')} />
            <svg className={`pd-bio__ring ${bioFill > 0.9 ? 'is-full' : ''}`} width={26} height={26} viewBox="0 0 26 26" aria-label={`${400 - form.bio.length} characters left`}>
              <circle cx={13} cy={13} r={10} fill="none" stroke="var(--line)" strokeWidth={3} />
              <motion.circle cx={13} cy={13} r={10} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" initial={false} animate={{ pathLength: bioFill }} style={{ rotate: -90, originX: '50%', originY: '50%' }} />
            </svg>
          </div>
        </Section>
      </div>

      <AnimatePresence>
        {(dirty || stamped) && (
          <motion.div className="pd-bar" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <span>{stamped ? 'Saved to your pass.' : 'Unsaved — the pass above already shows it.'}</span>
            {!stamped && <button type="button" className="d-chip" onClick={() => setForm(base)}>Discard</button>}
            <motion.button className={`pd-stamp ${stamped ? 'is-done' : ''}`} type="submit" disabled={saving || stamped} whileTap={{ scale: 0.9, rotate: -6 }}>
              <AnimatePresence mode="wait" initial={false}>
                {saving ? (
                  <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TrailSpinner /></motion.span>
                ) : stamped ? (
                  <motion.span key="d" initial={{ scale: 2.2, rotate: -18, opacity: 0 }} animate={{ scale: 1, rotate: -6, opacity: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 16 }}>Stamped ✓</motion.span>
                ) : (
                  <motion.span key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Stamp my pass</motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  )
}
