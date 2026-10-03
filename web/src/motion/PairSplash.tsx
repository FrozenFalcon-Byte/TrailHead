import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { deviceName, getPair, onPairEvent, onPairMessage, post, type PairEvent } from '../lib/pair'
import { chime, ring } from '../lib/toast'

/* The full-screen beats of a pairing, on whichever device this is. Linking pulls the two devices in from the edges
   and draws a cord between them; unpairing snaps the cord and throws them apart; a buzz from the other side fills the
   screen with rings until it is tapped away. Nothing fades: each one opens and closes with a clip. */

const INK = '#17161b'

/* Buzzing the other device plays its own beat here too, so the press is answered on the screen that made it. */
const sent = new Set<() => void>()
export function buzz() {
  if (getPair().status !== 'linked') return
  post({ t: 'ring' })
  sent.forEach((h) => h())
}
const COLORS = ['var(--orange)', 'var(--violet)', 'var(--green)', 'var(--blue)', 'var(--yellow)']

export function ScreenGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={3.5} y={4.5} width={17} height={11.5} rx={2} />
      <path d="M9 20 H15 M12 16 V20" />
    </svg>
  )
}
function HandGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={7} y={2.5} width={10} height={19} rx={2.6} />
      <path d="M11 18.5 H13" />
    </svg>
  )
}

export function Letters({ text, delay }: { text: string; delay: number }) {
  return (
    <h2 className="psp-title" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={i} className="psp-mask" aria-hidden>
          <motion.span initial={{ y: '110%', rotate: 8 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 22, delay: delay + i * 0.035 }}>
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        </span>
      ))}
    </h2>
  )
}

/** The two devices and the cord between them, laid out to fit this screen. Each tile carries its half of the cord, so
 *  the halves move with the tiles: linking draws the halves out until they meet in the middle, unpairing pulls the
 *  cord taut and red, snaps it, and lets each half whip back to its own device as the two are thrown apart. */
function Duo({ linked }: { linked: boolean }) {
  const W = Math.min(window.innerWidth * 0.92, 520)
  const T = W < 420 ? 76 : 92
  const near = Math.max(T / 2 + 34, W * 0.2)
  const far = W / 2 - T / 2 - 8
  const snap = 0.62
  return (
    <motion.div
      className="psp-duo"
      style={{ width: W, height: T + 40 }}
      animate={linked ? undefined : { x: [0, 0, -9, 8, -5, 3, 0] }}
      transition={{ duration: 1.1, times: [0, snap / 1.1, (snap + 0.06) / 1.1, (snap + 0.14) / 1.1, (snap + 0.22) / 1.1, (snap + 0.3) / 1.1, 1] }}
    >
      {[-1, 1].map((side) => {
        const s = -side // towards the middle
        // each half ends level in the middle, so the two read as one cord until it breaks
        const sag = `M0 0 Q ${s * near * 0.5} 18 ${s * near} 18`
        const taut = `M0 0 Q ${s * near * 0.5} 0 ${s * near} 0`
        const curl = `M0 0 Q ${s * near * 0.45} 8 ${s * near * 0.22} 46`
        return (
          <motion.span
            key={side}
            className="psp-dev"
            style={{ width: T, height: T, marginLeft: -T / 2, marginTop: -T / 2 }}
            initial={linked ? { x: side * (far + 90), rotate: side * 26, scale: 0.6 } : { x: side * near, rotate: 0, scale: 1 }}
            animate={
              linked
                ? { x: side * near, rotate: 0, scale: 1 }
                : { x: [side * near, side * near, side * (far + 16), side * far], y: [0, 0, -14, 0], rotate: [0, side * -5, side * 18, side * 13] }
            }
            transition={linked ? { type: 'spring', stiffness: 170, damping: 16, delay: 0.12 } : { duration: 1.25, times: [0, snap / 1.25, (snap + 0.3) / 1.25, 1], ease: [[0.3, 0, 0.6, 1], [0.2, 0.9, 0.3, 1], [0.4, 0, 0.3, 1]] }}
          >
            <svg className="psp-half" viewBox="-1 -1 2 2" aria-hidden>
              <motion.path
                fill="none"
                strokeWidth={5}
                strokeLinecap="round"
                initial={linked ? { d: sag, pathLength: 0, stroke: '#ffbd1a' } : { d: sag, pathLength: 1, stroke: '#ffbd1a' }}
                animate={linked ? { pathLength: 1 } : { d: [sag, taut, curl], pathLength: [1, 1, 0.3], stroke: ['#ffbd1a', '#ef4b33', '#ef4b33'] }}
                transition={linked ? { duration: 0.42, delay: 0.5, ease: [0.65, 0, 0.35, 1] } : { duration: 1.05, times: [0, snap / 1.05, 1], ease: [[0.4, 0, 0.6, 1], [0.1, 0.8, 0.3, 1]] }}
              />
            </svg>
            <motion.span
              className="psp-tile"
              style={{ width: T, height: T, background: side < 0 ? 'var(--butter)' : 'var(--peach)' }}
              animate={linked ? undefined : { x: [0, 0, 1.5, -1.5, 1.5, -1.5, 0, 0] }}
              transition={{ duration: snap, times: [0, 0.35, 0.5, 0.62, 0.74, 0.86, 0.98, 1] }}
            >
              {side < 0 ? <ScreenGlyph size={T * 0.4} /> : <HandGlyph size={T * 0.4} />}
            </motion.span>
          </motion.span>
        )
      })}
      {/* the moment in the middle: a ring and a scatter, where the halves meet or where the cord breaks */}
      <motion.span className="psp-pop" initial={{ scale: 0, borderWidth: 12 }} animate={{ scale: 2.6, borderWidth: 0 }} transition={{ duration: 0.6, delay: linked ? 0.92 : snap, ease: [0.22, 1, 0.36, 1] }} style={{ borderColor: linked ? '#fbf8f1' : '#ef4b33' }} aria-hidden />
      {Array.from({ length: linked ? 14 : 10 }, (_, i) => {
        const a = (i / (linked ? 14 : 10)) * Math.PI * 2 + (linked ? 0 : 0.3)
        const d = (linked ? 80 : 60) + (i % 3) * 26
        return (
          <motion.i
            key={i}
            className="psp-spark"
            style={{ background: linked ? COLORS[i % COLORS.length] : i % 2 ? '#ef4b33' : '#ffbd1a', borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? 3 : '50% 50% 50% 3px' }}
            initial={{ x: 0, y: 0, scale: 0, rotate: 0 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.7 + (linked ? 0 : 30), scale: [0, 1.2, 0], rotate: 220 }}
            transition={{ duration: linked ? 0.9 : 0.7, delay: linked ? 0.95 : snap, ease: [0.22, 1, 0.36, 1] }}
          />
        )
      })}
      {linked && <motion.i className="psp-runner" initial={{ x: -near, scale: 0 }} animate={{ x: [-near, near], scale: [0, 1, 1, 0] }} transition={{ duration: 0.7, delay: 1.15, ease: [0.65, 0, 0.35, 1], repeat: 1, repeatDelay: 0.08 }} aria-hidden />}
    </motion.div>
  )
}

function Splash({ e }: { e: PairEvent }) {
  const linked = e.kind !== 'unpaired'
  const me = deviceName()
  const peer = e.peer || (e.role === 'host' ? 'your phone' : 'your computer')
  const title = linked ? 'Linked' : 'Unpaired'
  const line = linked ? `${me} and ${peer} are on one trail` : e.by === 'you' ? `You let go of ${peer}` : `${peer} ended the link`
  const enter = linked ? { initial: 'circle(0% at 50% 50%)', open: 'circle(75% at 50% 50%)' } : { initial: 'inset(0 50% 0 50%)', open: 'inset(0 0% 0 0%)' }

  return (
    <motion.div
      className={`psp ${linked ? 'is-linked' : 'is-unpaired'}`}
      style={{ background: INK }}
      initial={{ clipPath: enter.initial }}
      animate={{ clipPath: enter.open }}
      exit={{ clipPath: enter.initial, transition: { duration: 0.45, ease: [0.76, 0, 0.24, 1] } }}
      transition={{ duration: linked ? 0.5 : 0.38, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
    >
      <motion.div className="psp-in" exit={{ y: -40, transition: { duration: 0.4, ease: [0.76, 0, 0.24, 1] } }}>
        <Duo linked={linked} />
        <Letters text={title} delay={linked ? 0.75 : 0.8} />
        <motion.p className="psp-line" initial={{ y: 24, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ type: 'spring', stiffness: 260, damping: 26, delay: linked ? 1 : 1.0 }}>
          {line}
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

function Buzz({ from, onDone }: { from: string; onDone: () => void }) {
  return (
    <motion.div
      className="psp psp-buzz"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(75% at 50% 50%)', x: [0, -14, 14, -10, 10, -6, 6, 0] }}
      exit={{ clipPath: 'circle(0% at 50% 50%)', transition: { duration: 0.4, ease: [0.76, 0, 0.24, 1] } }}
      transition={{ clipPath: { duration: 0.45, ease: [0.22, 1, 0.36, 1] }, x: { duration: 0.6, delay: 0.3, repeat: 2, repeatDelay: 0.25 } }}
      onClick={onDone}
      role="alert"
    >
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="psp-ring" initial={{ scale: 0.3, borderWidth: 18 }} animate={{ scale: 3.4, borderWidth: 0 }} transition={{ duration: 1.3, delay: 0.2 + i * 0.32, repeat: Infinity, repeatDelay: 0.3, ease: [0.22, 1, 0.36, 1] }} aria-hidden />
      ))}
      <motion.span className="psp-bell" animate={{ rotate: [0, -18, 16, -12, 10, 0] }} transition={{ duration: 0.7, repeat: Infinity, repeatDelay: 0.2 }} aria-hidden>
        {getPair().role === 'phone' ? <ScreenGlyph size={58} /> : <HandGlyph size={58} />}
      </motion.span>
      <Letters text="Buzz!" delay={0.2} />
      <p className="psp-line">{from ? `${from} is looking for you` : 'Your other screen is looking for you'} · tap to close</p>
    </motion.div>
  )
}

/** The sender's half: the other device's glyph flies off with rings trailing behind it. */
function Sent({ to }: { to: string }) {
  return (
    <motion.div
      className="psp psp-sent"
      initial={{ clipPath: 'inset(42% 30% 42% 30% round 40px)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0% round 0px)' }}
      exit={{ clipPath: 'inset(50% 50% 50% 50% round 40px)', transition: { duration: 0.42, ease: [0.76, 0, 0.24, 1] } }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
      role="status"
    >
      <div className="psp-sent__stage" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <motion.span key={i} className="psp-wave" initial={{ x: 0, scale: 0.4, borderWidth: 6 }} animate={{ x: 0, scale: 2.6, borderWidth: 0 }} transition={{ duration: 0.9, delay: 0.25 + i * 0.16, ease: [0.22, 1, 0.36, 1] }} />
        ))}
        <motion.span className="psp-tile psp-tile--small" style={{ background: 'var(--peach)' }} initial={{ x: -120, rotate: -20, scale: 0.5 }} animate={{ x: [-120, 0, 0, 6, -6, 4, -4, 0], rotate: [-20, 0, 0, 10, -10, 8, -8, 0], scale: 1 }} transition={{ duration: 1.1, times: [0, 0.3, 0.45, 0.55, 0.65, 0.75, 0.85, 1], ease: 'easeOut' }}>
          {getPair().role === 'phone' ? <ScreenGlyph size={30} /> : <HandGlyph size={30} />}
        </motion.span>
      </div>
      <Letters text={`${to} buzzed`} delay={0.25} />
      <p className="psp-line">It is ringing over there now</p>
    </motion.div>
  )
}

export function PairSplash() {
  const reduce = useReducedMotion()
  const [ev, setEv] = useState<(PairEvent & { id: number }) | null>(null)
  const [buzz, setBuzz] = useState<{ id: number; from: string } | null>(null)
  const [out, setOut] = useState<{ id: number; to: string } | null>(null)
  useEffect(() => {
    const h = () => {
      const p = getPair()
      setOut({ id: Date.now(), to: p.peer ? `Your ${p.peer}` : p.role === 'host' ? 'Your phone' : 'Your computer' })
      navigator.vibrate?.(20)
    }
    sent.add(h)
    return () => {
      sent.delete(h)
    }
  }, [])
  useEffect(() => {
    if (!out) return
    const t = window.setTimeout(() => setOut(null), 1700)
    return () => window.clearTimeout(t)
  }, [out])

  useEffect(
    () =>
      onPairEvent((e) => {
        if (e.kind === 'relinked') return // a dropped signal coming back is not worth taking the screen
        setBuzz(null)
        setEv({ ...e, id: Date.now() })
        if (e.kind === 'linked') chime('success')
        else chime('warn')
        if (e.role === 'phone') navigator.vibrate?.(e.kind === 'linked' ? [30, 50, 60] : [80])
      }),
    [],
  )
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t !== 'ring') return
        setBuzz({ id: Date.now(), from: getPair().peer })
        ring()
        navigator.vibrate?.([90, 60, 90, 60, 180])
      }),
    [],
  )
  useEffect(() => {
    if (!ev) return
    const t = window.setTimeout(() => setEv(null), reduce ? 1400 : 2400)
    return () => window.clearTimeout(t)
  }, [ev, reduce])
  useEffect(() => {
    if (!buzz) return
    const t = window.setTimeout(() => setBuzz(null), 2600)
    return () => window.clearTimeout(t)
  }, [buzz])

  return createPortal(
    <AnimatePresence>
      {ev && <Splash key={ev.id} e={ev} />}
      {buzz && !ev && <Buzz key={buzz.id} from={buzz.from} onDone={() => setBuzz(null)} />}
      {out && !ev && !buzz && <Sent key={out.id} to={out.to} />}
    </AnimatePresence>,
    document.body,
  )
}
