import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCornerSlot } from '../lib/corner'
import { COLD_START_S, dismissWake, isHosted, useWake, watchWake } from '../lib/wake'

/* The wait for a sleeping server, told as dawn at a ranger station. While the host boots, the sun climbs behind
   the peak in step with the real seconds, the stove smokes and a marker walks the trail toward the station. The
   moment /api/health answers, the sun clears the ridge, the window lights, a flag goes up and the card says how
   long it took before lifting away. It covers any page as a splash; "Keep browsing" shrinks it into a small toast
   in the corner that keeps counting and opens the splash again when pressed. */

const TRAIL = 'M18 104 C 70 104, 92 84, 140 86 S 214 104, 262 96 S 318 80, 334 82'
const EASE = [0.76, 0, 0.24, 1] as const

const HINTS = [
  'Free hosting naps after 15 quiet minutes',
  `A cold start takes about ${COLD_START_S} seconds`,
  'Keep reading; this card follows along',
  'Everything loads the moment it answers',
]

function useSeconds(since: number, live: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [live])
  return Math.max(0, (now - since) / 1000)
}

function Dawn({ frac, awake }: { frac: number; awake: boolean }) {
  const reduce = useReducedMotion()
  const sunY = 96 - 50 * frac
  return (
    <svg viewBox="0 0 352 120" className="wk-scene" aria-hidden>
      <motion.rect width="352" height="120" className="wk-sky" animate={{ opacity: awake ? 0 : 1 - frac * 0.7 }} transition={{ duration: 0.8 }} />
      {[[40, 22], [96, 14], [210, 26], [300, 16], [326, 38], [150, 34]].map(([x, y], i) => (
        <motion.circle key={i} cx={x} cy={y} r={1.6} className="wk-star" animate={{ opacity: awake ? 0 : Math.max(0, 1 - frac * 1.4) }} transition={{ duration: 0.6 }} />
      ))}
      <motion.g animate={{ y: awake ? -52 : sunY - 96, scale: awake ? 1.12 : 1 }} transition={awake ? { type: 'spring', stiffness: 120, damping: 12 } : { duration: 0.5, ease: 'linear' }} style={{ originX: '176px', originY: '96px' }}>
        <circle cx={176} cy={96} r={20} className="wk-sun" />
        {awake && [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => (
          <motion.path key={a} d="M176 66 V58" className="wk-ray" transform={`rotate(${a} 176 96)`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25 + i * 0.03, duration: 0.3 }} />
        ))}
      </motion.g>
      <path d="M96 110 L176 34 L256 110 Z" className="tm-peak" />
      <path d="M176 34 L256 110 L190 110 Z" className="tm-peak__shade" />
      <path d="M164 46 L176 34 L188 46 L180 42 L173 49 Z" className="tm-peak__snow" />
      <path d="M96 110 L176 34 L256 110" className="tm-peak__line" />
      <path d="M0 106 C 70 96, 150 116, 220 104 S 320 98, 352 104 V120 H0 Z" className="wk-hill" />
      <path d={TRAIL} className="tl-ghost" />
      <motion.path d={TRAIL} className="wk-ink" initial={{ pathLength: 0 }} animate={{ pathLength: awake ? 1 : Math.min(0.9, frac) }} transition={{ duration: awake ? 0.6 : 0.5, ease: awake ? EASE : 'linear' }} />
      {/* the station */}
      <g transform="translate(318 84)">
        <path d="M-14 0 V-16 L0 -28 L14 -16 V0 Z" className="wk-hut" />
        <path d="M-18 -13 L0 -30 L18 -13" className="wk-roof" />
        <motion.rect x={-5} y={-14} width={10} height={9} rx={1.5} className="wk-window" animate={{ fill: awake ? 'var(--yellow)' : 'var(--solid)' }} transition={{ duration: 0.4, delay: 0.3 }} />
        <path d="M8 -22 V-30 H12 V-19" className="wk-roof" />
        {!awake && !reduce && [0, 1, 2].map((i) => (
          <circle key={i} cx={10} cy={-32} r={2.6} className="wk-smoke" style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
        <g transform="translate(-22 0)">
          <path d="M0 0 V-24" className="tm-flag__pole" />
          <motion.path d="M0 -24 L14 -20 L0 -16 Z" className="wk-flag" initial={false} animate={{ scaleX: awake ? 1 : 0, rotate: awake ? 0 : -40 }} transition={{ type: 'spring', stiffness: 320, damping: 10, delay: 0.5 }} style={{ transformBox: 'fill-box', transformOrigin: 'left center' }} />
        </g>
      </g>
      <WalkerAt frac={awake ? 1 : Math.min(0.9, frac)} />
    </svg>
  )
}

/** The marker sits at a point along the trail; motion's spring makes it walk between positions. */
function WalkerAt({ frac }: { frac: number }) {
  const [pt, setPt] = useState<[number, number]>([18, 104])
  useEffect(() => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    el.setAttribute('d', TRAIL)
    const p = el.getPointAtLength(frac * el.getTotalLength() * 0.94)
    setPt([p.x, p.y])
  }, [frac])
  return (
    <motion.g animate={{ x: pt[0], y: pt[1] }} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
      <circle r={8} className="tl-walker__ring" />
      <circle r={5} className="tl-walker__dot" />
    </motion.g>
  )
}

export function WakeSheet() {
  const w = useWake()
  const reduce = useReducedMotion()
  const [folded, setFolded] = useState(false)
  const [hint, setHint] = useState(0)
  const live = w.phase === 'waking'
  const secs = useSeconds(w.since, live)
  const shown = w.phase === 'waking' || w.phase === 'awake' || w.phase === 'down'
  const awake = w.phase === 'awake'
  const frac = Math.min(1, secs / COLD_START_S)
  const took = Math.round(w.took / 1000)
  const slot = useCornerSlot('wake', shown && folded)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setHint((n) => (n + 1) % HINTS.length), 3200)
    return () => window.clearInterval(id)
  }, [live])
  // A new outage opens as the full splash. Retries during the same outage (every failed request starts one) keep
  // whatever the person chose, so "Keep browsing" is not undone a few seconds later.
  const prev = useRef(w.phase)
  useEffect(() => {
    if (prev.current === 'up' && w.phase !== 'up' && w.phase !== 'checking') setFolded(false)
    if (w.phase !== 'checking') prev.current = w.phase
  }, [w.phase])
  useEffect(() => {
    if (!shown) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFolded(true)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [shown])

  const over = secs > COLD_START_S + 5
  const title = awake ? `Awake. That took ${took}s.` : w.phase === 'down' ? 'The server did not wake' : over ? 'Nearly there' : 'Waking the server'
  const line = awake ? 'Everything is loading now.' : w.phase === 'down' ? (isHosted() ? 'It stopped answering for over two minutes. It may be redeploying.' : 'Nothing answers at /api. Start the local API (bin/trailhead serve) and try again.') : over ? 'Taking a little longer than usual. Still trying every few seconds.' : HINTS[hint]
  const spring = { type: 'spring' as const, stiffness: 260, damping: 26 }

  return createPortal(
    <AnimatePresence>
      {shown && !folded && (
        <motion.div
          key="splash"
          className={`wks is-${w.phase}`}
          role="status"
          aria-live="polite"
          initial={reduce ? false : { y: '100%' }}
          animate={{ y: 0, scale: 1, borderRadius: 0 }}
          exit={reduce ? { opacity: 0 } : awake ? { y: '-100%', transition: { duration: 0.6, ease: EASE } } : { scale: 0.05, borderRadius: 400, transition: { duration: 0.45, ease: EASE } }}
          transition={spring}
          style={{ transformOrigin: '44px calc(100% - 44px)' }}
        >
          <motion.div className="wks-in" initial={{ y: 30 }} animate={{ y: 0 }} transition={{ ...spring, delay: 0.1 }}>
            <motion.div className="wks-scene" initial={{ rotate: -3, scale: 0.92 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14, delay: 0.15 }}>
              <Dawn frac={frac} awake={awake} />
            </motion.div>
            <span className="wks-kicker">{awake ? 'Server awake' : w.phase === 'down' ? 'Server' : 'Cold start'}</span>
            <span className="wk-title wks-title">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.b key={title} initial={{ y: 30, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -30, rotateX: 80 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>{title}</motion.b>
              </AnimatePresence>
            </span>
            <span className="wk-line wks-line">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={line} initial={{ y: 14, rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -14, rotateX: 70 }} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>{line}</motion.span>
              </AnimatePresence>
            </span>
            {live && (
              <div className="wks-meter" aria-label={`${Math.floor(secs)} seconds of about ${COLD_START_S}`}>
                <div className="wks-bar"><motion.i animate={{ scaleX: Math.min(0.97, frac) }} transition={{ duration: 0.4, ease: 'linear' }} /></div>
                <span className="mono"><b>{Math.floor(secs)}s</b> of about {COLD_START_S}s</span>
              </div>
            )}
            <div className="wks-go">
              {live && <motion.button className="wks-btn is-solid" whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => setFolded(true)} data-cursor="Shrink this to a toast">Keep browsing</motion.button>}
              {awake && <motion.button className="wks-btn is-solid" whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={dismissWake}>Go</motion.button>}
              {w.phase === 'down' && <>
                <motion.button className="wks-btn is-solid" whileHover={{ y: -2 }} whileTap={{ scale: 0.95 }} onClick={() => watchWake()}>Try again</motion.button>
                <button className="wks-btn" onClick={() => setFolded(true)}>Keep browsing</button>
              </>}
            </div>
          </motion.div>
        </motion.div>
      )}
      {shown && folded && (
        <motion.button
          key="toast"
          ref={slot.measure}
          className={`wkt is-${w.phase}`}
          onClick={() => (awake ? dismissWake() : setFolded(false))}
          initial={reduce ? false : { scale: 0, rotate: -12, y: 20 }}
          animate={{ scale: 1, rotate: 0, y: -slot.offset, transition: { type: 'spring', stiffness: 380, damping: 20, delay: 0.3, y: { type: 'spring', stiffness: 300, damping: 28 } } }}
          exit={{ scale: 0, rotate: 12, transition: { duration: 0.22 } }}
          style={{ transformOrigin: 'left bottom' }}
          aria-label={awake ? 'The server is awake' : 'Open the server wake-up screen'}
          data-cursor={awake ? 'Done' : 'Open'}
        >
          <svg viewBox="0 0 36 36" className="wk-chip__ring" aria-hidden>
            <circle cx="18" cy="18" r="15" className="wk-chip__track" />
            <motion.circle cx="18" cy="18" r="15" className="wk-chip__fill" animate={{ pathLength: awake ? 1 : Math.min(0.96, frac) }} transition={{ duration: 0.4, ease: 'linear' }} />
            {awake && <motion.path d="M11 18.5l4.5 4.5L25 13.5" className="wkt-check" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} style={{ rotate: 90, originX: '18px', originY: '18px' }} />}
          </svg>
          <span className="wkt-copy">
            <b>{awake ? 'Server awake' : w.phase === 'down' ? 'Server not answering' : 'Waking the server'}</b>
            <small>{awake ? `took ${took}s` : w.phase === 'down' ? 'tap to try again' : `${Math.floor(secs)}s of about ${COLD_START_S}s`}</small>
          </span>
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  )
}
