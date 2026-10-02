import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { PasskeyListItem } from '@supabase/supabase-js'

/* The sign-in hardware, drawn: passkeys hang from a key ring as tags, a new one is added by "scanning" into an
   empty slot, email changes travel in an envelope, and the password padlock closes as the password gets stronger. */

const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '')

// Where a passkey lives, guessed from the name the password manager gave it.
const KEEPERS: { test: RegExp; label: string; color: string; ink: string }[] = [
  { test: /apple|icloud|keychain/i, label: 'Apple', color: '#f5f1e8', ink: '#17161b' },
  { test: /google|chrome|android/i, label: 'Google', color: 'var(--sky)', ink: '#17161b' },
  { test: /1password/i, label: '1Password', color: 'var(--blue)', ink: '#fbf8f1' },
  { test: /bitwarden/i, label: 'Bitwarden', color: 'var(--violet)', ink: '#fbf8f1' },
  { test: /windows|hello|microsoft|edge/i, label: 'Windows', color: 'var(--mint)', ink: '#17161b' },
  { test: /yubi|security key/i, label: 'Security key', color: 'var(--yellow)', ink: '#17161b' },
]
const TAGS = ['var(--lime)', 'var(--peach)', 'var(--lilac)', 'var(--butter)', 'var(--mint)']
const keeper = (name: string, i: number) => KEEPERS.find((k) => k.test.test(name)) ?? { label: 'Passkey', color: TAGS[i % TAGS.length], ink: '#17161b' }

function KeyArt({ color }: { color: string }) {
  return (
    <svg width={64} height={30} viewBox="0 0 64 30" aria-hidden>
      <circle cx={15} cy={15} r={12} fill={color} stroke="var(--solid)" strokeWidth={2.5} />
      <circle cx={15} cy={15} r={4.5} fill="var(--paper)" stroke="var(--solid)" strokeWidth={2} />
      <path d="M27 15 H60 V21 H54 V18 H49 V22 H43 V18 H27 Z" fill={color} stroke="var(--solid)" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  )
}

/* A whorl: nested loops around a core, each with its own tail lengths, plus a few stray ridges, the way real
   prints run. Drawn once and reused by the biometric mark. */
const RIDGES = [0, 1, 2, 3, 4, 5].map((i) => {
  const rx = 2.6 + i * 3.5
  const ry = 3.4 + i * 4
  const cy = 26
  const left = cy + 3 + ((i * 5) % 9) + i * 1.6
  const right = cy + 1 + ((i * 7) % 11) + i * 1.2
  return { d: `M${28 - rx} ${left.toFixed(1)} V${cy} A${rx} ${ry} 0 0 1 ${28 + rx} ${cy} V${right.toFixed(1)}` }
}).concat([
  // Short ridges below the core and at the edges, which keep it from reading as a target.
  { d: 'M24 40 Q28 37 32 40' }, { d: 'M21 45 Q28 40.5 35 45' }, { d: 'M5 30 Q4 22 8 15' }, { d: 'M49 33 Q52 24 48 14' },
])

type Phase = 'finger' | 'face' | 'done'

/** The passkey mark: a fingerprint is scanned, folds away into Face ID brackets, a face is read, and it passes.
    Loops slowly at rest and quickly while the browser is waiting on the device. */
export function BiometricMark({ scanning, size = 60 }: { scanning: boolean; size?: number }) {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('finger')
  useEffect(() => {
    if (reduce) return
    const order: Phase[] = ['finger', 'face', 'done']
    const t = setInterval(() => setPhase((p) => order[(order.indexOf(p) + 1) % order.length]), scanning ? 1300 : 2400)
    return () => clearInterval(t)
  }, [scanning, reduce])
  const finger = reduce || phase === 'finger'
  const ok = phase === 'done' && !reduce
  const ink = ok ? 'var(--green)' : 'var(--solid)'
  const spring = { type: 'spring' as const, stiffness: 220, damping: 20 }
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden className="bio">
      <motion.g animate={{ scale: finger ? 1 : 0.55, opacity: finger ? 1 : 0, rotate: finger ? 0 : 40 }} transition={spring} style={{ originX: '28px', originY: '28px' }}>
        {RIDGES.map((r, i) => (
          <motion.path key={i} d={r.d} fill="none" stroke="var(--solid)" strokeWidth={2.3} strokeLinecap="round"
            initial={{ pathLength: 0 }} animate={{ pathLength: finger ? 1 : 0 }} transition={{ duration: 0.7, delay: finger ? i * 0.06 : 0, ease: 'easeOut' }} />
        ))}
        {finger && !reduce && (
          <motion.rect x={3} width={50} height={3} rx={1.5} fill="var(--green)" initial={{ y: 4, opacity: 0 }} animate={{ y: [4, 50, 4], opacity: [0, 1, 0.9, 0] }} transition={{ duration: scanning ? 1.1 : 2, ease: 'easeInOut' }} />
        )}
      </motion.g>
      <motion.g animate={{ scale: finger ? 1.35 : 1, opacity: finger ? 0 : 1 }} transition={spring} style={{ originX: '28px', originY: '28px' }}>
        {['M4 16 V9 Q4 4 9 4 H16', 'M40 4 H47 Q52 4 52 9 V16', 'M52 40 V47 Q52 52 47 52 H40', 'M16 52 H9 Q4 52 4 47 V40'].map((d) => (
          <motion.path key={d} d={d} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" animate={{ stroke: ink }} />
        ))}
        <motion.path d="M20 20 V25 M36 20 V25" stroke={ink} strokeWidth={3} strokeLinecap="round" animate={{ pathLength: finger ? 0 : 1, stroke: ink }} transition={{ duration: 0.35, delay: 0.15 }} />
        <motion.path d="M29 20 V31 H26" fill="none" stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" animate={{ pathLength: finger ? 0 : 1, stroke: ink }} transition={{ duration: 0.4, delay: 0.25 }} />
        <motion.path d="M20 37 Q28 44 36 37" fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" animate={{ pathLength: finger ? 0 : 1, d: ok ? 'M19 36 Q28 46 37 36' : 'M20 37 Q28 44 36 37', stroke: ink }} transition={{ duration: 0.4, delay: 0.35 }} />
        {phase === 'face' && !reduce && (
          <motion.rect x={4} width={48} height={2.5} rx={1.25} fill="var(--blue)" initial={{ y: 6, opacity: 0 }} animate={{ y: [6, 48], opacity: [0, 1, 0] }} transition={{ duration: scanning ? 0.9 : 1.4, delay: 0.3, ease: 'easeInOut' }} />
        )}
      </motion.g>
    </svg>
  )
}

export function KeyRing({ keys, error, adding, onAdd, onRename, onDelete }: { keys: PasskeyListItem[] | null; error: string; adding: boolean; onAdd: () => void; onRename: (k: PasskeyListItem, name: string) => void; onDelete: (k: PasskeyListItem) => void }) {
  return (
    <div className="p-card is-wide ks">
      <div className="ks-head">
        <div>
          <h3 className="chunk">Passkeys</h3>
          <p className="d-muted">Your fingerprint, face or device PIN, instead of a password. Each device or password manager keeps its own key.</p>
        </div>
      </div>
      <div className="ks-ring">
        <svg className="ks-ring__bar" viewBox="0 0 1000 24" preserveAspectRatio="none" aria-hidden>
          <path d="M8 12 H992" stroke="var(--solid)" strokeWidth={5} strokeLinecap="round" />
        </svg>
        <div className="ks-keys">
          {keys === null && <span className="d-muted small ks-loading">Finding your keys…</span>}
          <AnimatePresence initial={false}>
            {keys?.map((k, i) => {
              const kp = keeper(k.friendly_name ?? '', i)
              return (
                <motion.div
                  key={k.id}
                  layout
                  className="ks-key"
                  style={{ ['--tag' as string]: kp.color, ['--tag-ink' as string]: kp.ink }}
                  initial={{ y: -60, rotate: -25, opacity: 0 }}
                  animate={{ y: 0, rotate: 0, opacity: 1 }}
                  exit={{ y: 80, rotate: 30, opacity: 0, transition: { duration: 0.35 } }}
                  transition={{ type: 'spring', stiffness: 220, damping: 12, delay: i * 0.08 }}
                  whileHover={{ rotate: [0, -6, 4, -2, 0], transition: { duration: 0.8 } }}
                >
                  <span className="ks-key__loop" aria-hidden />
                  <div className="ks-key__tag">
                    <span className="ks-key__keeper">{kp.label}</span>
                    <input defaultValue={k.friendly_name || 'Passkey'} aria-label="Passkey name" maxLength={120} onBlur={(e) => onRename(k, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} data-cursor="Rename" />
                    <span className="ks-key__meta">Added {day(k.created_at)}</span>
                    <span className="ks-key__meta">{k.last_used_at ? `Last opened the door ${day(k.last_used_at)}` : 'Not used yet'}</span>
                    <KeyArt color={kp.color} />
                    <button className="ks-key__x" onClick={() => onDelete(k)} aria-label="Remove passkey" data-cursor="Take it off the ring">
                      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" /></svg>
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
          <motion.button layout className={`ks-slot ${adding ? 'is-scanning' : ''}`} onClick={onAdd} disabled={adding} data-cursor={adding ? 'Check your device' : 'Add a passkey'} whileHover={{ y: -4 }} whileTap={{ scale: 0.96 }}>
            <span className="ks-key__loop" aria-hidden />
            <BiometricMark scanning={adding} />
            <b>{adding ? 'Waiting for your device…' : keys?.length ? 'Add another key' : 'Add your first key'}</b>
            <span>{error ? `Not available: ${error}` : adding ? 'Confirm with Touch ID, Face ID or your PIN' : 'Takes one touch'}</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
}

export function EmailCard({ current, busy, onSend }: { current: string; busy: boolean; onSend: (email: string) => Promise<boolean> }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(0)
  const ok = /^\S+@\S+\.\S+$/.test(email)
  return (
    <form
      className="p-card sc-mail"
      onSubmit={async (e) => {
        e.preventDefault()
        if (ok && (await onSend(email))) {
          setSent((s) => s + 1)
          setEmail('')
        }
      }}
    >
      <h3 className="chunk">Email address</h3>
      <div className="sc-env">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={sent} className="sc-env__paper" initial={{ y: 40, opacity: 0, rotate: -4 }} animate={{ y: 0, opacity: 1, rotate: -2 }} exit={{ x: 260, y: -120, rotate: 24, opacity: 0, transition: { duration: 0.6, ease: [0.5, 0, 0.75, 0] } }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <svg className="sc-env__art" width={46} height={34} viewBox="0 0 46 34" aria-hidden>
              <rect x={2} y={2} width={42} height={30} rx={5} fill="var(--butter)" stroke="var(--solid)" strokeWidth={2.4} />
              <motion.path d="M3 5 L23 20 L43 5" fill="none" stroke="var(--solid)" strokeWidth={2.4} strokeLinejoin="round" animate={{ d: ok ? 'M3 5 L23 13 L43 5' : 'M3 5 L23 20 L43 5' }} />
            </svg>
            <span className="sc-env__to">To</span>
            <b className="sc-env__addr">{email || current || 'no address yet'}</b>
            <span className="sc-env__stamp" aria-hidden>{email ? 'new' : 'now'}</span>
          </motion.div>
        </AnimatePresence>
      </div>
      <input className="field" type="email" autoComplete="email" placeholder="new@address.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="New email address" />
      <button className="btn small" disabled={!ok || busy}><span>{busy ? 'Sending…' : 'Send the confirmation'}</span><span className="arrow">↗</span></button>
      <span className="d-muted small">Links go to both addresses; the change happens once you confirm.</span>
    </form>
  )
}

export function PasswordCard({ has, busy, onSave }: { has: boolean; busy: boolean; onSave: (pw: string) => Promise<boolean> }) {
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [show, setShow] = useState(false)
  const rules = [
    { label: '8+ characters', ok: a.length >= 8 },
    { label: 'Upper and lower case', ok: /[a-z]/.test(a) && /[A-Z]/.test(a) },
    { label: 'A number', ok: /\d/.test(a) },
    { label: 'A symbol', ok: /[^\w\s]/.test(a) },
  ]
  const score = rules.filter((r) => r.ok).length
  const locked = score === 4 && a === b
  const same = b !== '' && a === b
  return (
    <form
      id="password-card"
      className="p-card sc-pw"
      onSubmit={async (e) => {
        e.preventDefault()
        if (a.length >= 8 && a === b && (await onSave(a))) {
          setA('')
          setB('')
        }
      }}
    >
      <div className="sc-pw__head">
        <h3 className="chunk">{has ? 'Change password' : 'Set a password'}</h3>
        <svg width={44} height={52} viewBox="0 0 44 52" aria-hidden>
          <motion.path d="M12 24 V15 A10 10 0 0 1 32 15 V24" fill="none" stroke="var(--solid)" strokeWidth={4.5} strokeLinecap="round" animate={{ y: locked ? 0 : -8 - (4 - score) * 1.5, rotate: locked ? 0 : -14 }} style={{ originX: '32px', originY: '24px' }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} />
          <motion.rect x={4} y={22} width={36} height={28} rx={8} stroke="var(--solid)" strokeWidth={3} animate={{ fill: locked ? 'var(--green)' : score >= 2 ? 'var(--yellow)' : a ? 'var(--orange)' : 'var(--paper)' }} />
          <circle cx={22} cy={34} r={3.5} fill="var(--solid)" />
          <path d="M22 36 V42" stroke="var(--solid)" strokeWidth={3} strokeLinecap="round" />
        </svg>
      </div>
      <div className="sc-pw__field">
        <input id="password" className="field" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="New password" value={a} onChange={(e) => setA(e.target.value)} aria-label="New password" />
        <button type="button" className="sc-pw__eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} data-cursor={show ? 'Hide' : 'Peek'}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
            <motion.circle cx={12} cy={12} r={3} animate={{ scale: show ? 1 : 0.2 }} />
            {!show && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      <div className="sc-rules">
        {rules.map((r) => (
          <motion.span key={r.label} className={r.ok ? 'is-ok' : ''} animate={r.ok ? { scale: [1, 1.12, 1] } : { scale: 1 }} transition={{ duration: 0.3 }}>
            <i>{r.ok ? '✓' : ''}</i>
            {r.label}
          </motion.span>
        ))}
      </div>
      <div className="sc-pw__field">
        <input className="field" type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Same again" value={b} onChange={(e) => setB(e.target.value)} aria-label="Repeat the password" />
        <AnimatePresence>{same && <motion.span className="sc-pw__match" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>✓</motion.span>}</AnimatePresence>
      </div>
      <button className="btn small" disabled={a.length < 8 || a !== b || busy}><span>{busy ? 'Saving…' : has ? 'Change password' : 'Set password'}</span></button>
    </form>
  )
}
