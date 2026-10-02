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

function Letters({ text, delay }: { text: string; delay: number }) {
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

function Splash({ e }: { e: PairEvent }) {
  const linked = e.kind !== 'unpaired'
  const me = deviceName()
  const peer = e.peer || (e.role === 'host' ? 'your phone' : 'your computer')
  const title = linked ? 'Linked' : 'Unpaired'
  const line = linked ? `${me} and ${peer} are on one trail` : e.by === 'you' ? `You let go of ${peer}` : `${peer} ended the link`
  // tiles: far apart -> together when linking; together -> thrown apart when unpairing
  const from = linked ? 46 : 13
  const to = linked ? 13 : 30
  const cord = 'M -100 0 C -50 26, 50 26, 100 0'
  const enter = linked ? { initial: 'circle(0% at 50% 50%)', open: 'circle(75% at 50% 50%)' } : { initial: 'inset(0 50% 0 50%)', open: 'inset(0 0% 0 0%)' }

  return (
    <motion.div
      className={`psp ${linked ? 'is-linked' : 'is-unpaired'}`}
      style={{ background: INK }}
      initial={{ clipPath: enter.initial }}
      animate={{ clipPath: enter.open }}
      exit={{ clipPath: enter.initial, transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] } }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      role="status"
      aria-live="polite"
    >
      <motion.div className="psp-in" exit={{ y: -40, transition: { duration: 0.4, ease: [0.76, 0, 0.24, 1] } }}>
        <div className="psp-duo">
          <svg className="psp-cord" viewBox="-160 -40 320 80" aria-hidden>
            {linked ? (
              <>
                <motion.path d={cord} fill="none" stroke="var(--yellow)" strokeWidth={5} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.55, delay: 0.55, ease: [0.65, 0, 0.35, 1] }} />
                <motion.circle r={7} fill="#fff" initial={{ offsetDistance: '0%', scale: 0 }} animate={{ offsetDistance: ['0%', '100%'], scale: [0, 1, 1, 0] }} transition={{ duration: 0.9, delay: 1.1, ease: 'easeInOut', repeat: 1, repeatDelay: 0.1 }} style={{ offsetPath: `path('${cord}')` }} />
              </>
            ) : (
              <>
                <motion.path d="M -100 0 C -60 24, -20 26, 0 24" fill="none" stroke="var(--stop)" strokeWidth={5} strokeLinecap="round" initial={{ pathLength: 1, rotate: 0 }} animate={{ pathLength: 0, rotate: -18 }} transition={{ delay: 0.45, type: 'spring', stiffness: 160, damping: 14 }} style={{ originX: '-100px', originY: '0px' }} />
                <motion.path d="M 100 0 C 60 24, 20 26, 0 24" fill="none" stroke="var(--stop)" strokeWidth={5} strokeLinecap="round" initial={{ pathLength: 1, rotate: 0 }} animate={{ pathLength: 0, rotate: 18 }} transition={{ delay: 0.45, type: 'spring', stiffness: 160, damping: 14 }} style={{ originX: '100px', originY: '0px' }} />
              </>
            )}
          </svg>
          {[
            { key: 'screen', side: -1, bg: 'var(--butter)', glyph: <ScreenGlyph size={34} /> },
            { key: 'phone', side: 1, bg: 'var(--peach)', glyph: <HandGlyph size={34} /> },
          ].map((t) => (
            <motion.span
              key={t.key}
              className="psp-tile"
              style={{ background: t.bg }}
              initial={{ x: `${t.side * from}vmin`, rotate: linked ? t.side * 24 : 0, scale: linked ? 0.6 : 1 }}
              animate={{ x: `${t.side * to}vmin`, rotate: linked ? 0 : t.side * 14, scale: 1 }}
              transition={linked ? { type: 'spring', stiffness: 170, damping: 15, delay: 0.15 } : { type: 'spring', stiffness: 220, damping: 12, delay: 0.5 }}
            >
              {t.glyph}
            </motion.span>
          ))}
          {linked &&
            Array.from({ length: 14 }, (_, i) => {
              const a = (i / 14) * Math.PI * 2
              const d = 90 + (i % 3) * 34
              return (
                <motion.i
                  key={i}
                  className="psp-spark"
                  style={{ background: COLORS[i % COLORS.length], borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? 4 : '50% 50% 50% 4px' }}
                  initial={{ x: 0, y: 12, scale: 0, rotate: 0 }}
                  animate={{ x: Math.cos(a) * d, y: 12 + Math.sin(a) * d * 0.7, scale: [0, 1.2, 0], rotate: 200 }}
                  transition={{ duration: 0.9, delay: 1.05, ease: [0.22, 1, 0.36, 1] }}
                />
              )
            })}
        </div>
        <Letters text={title} delay={linked ? 0.75 : 0.35} />
        <motion.p className="psp-line" initial={{ y: 24, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ type: 'spring', stiffness: 260, damping: 26, delay: linked ? 1 : 0.6 }}>
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
