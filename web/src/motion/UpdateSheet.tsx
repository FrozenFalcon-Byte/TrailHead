import { animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mark } from './Mark'

/* The update, told as one walk. Leaving: a dark sheet rolls up over the dashboard, a marker sets off along a
   trail through the mountains, and the page reloads mid-walk. Arriving: the new build opens on the same sheet
   with the marker where it left off; it reaches the flag, says what changed, and the sheet rolls away onto the
   new dashboard. index.html paints the sheet's colour before the script loads, so there is no flash between. */

const KEY = 'th-arrive'
const TRAIL = 'M-20 120 C 120 120, 160 70, 260 76 S 420 132, 520 110 S 700 54, 800 70 S 900 100, 946 98'
const HALF = 0.55

type Arrival = { changes: string[]; t: number }

export function markLeaving(changes: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ changes: changes.slice(0, 3), t: Date.now() } satisfies Arrival))
  } catch {
    /* storage blocked: the arrival half simply does not play */
  }
}

/** Read once on boot; the arrival only plays for a reload that started in the last few seconds. */
export function takeArrival(): Arrival | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    const a = raw ? (JSON.parse(raw) as Arrival) : null
    return a && Date.now() - a.t < 20000 ? a : null
  } catch {
    return null
  }
}

function Scene({ from, to, duration, flag, onDone }: { from: number; to: number; duration: number; flag: boolean; onDone?: () => void }) {
  const reduce = useReducedMotion()
  const path = useRef<SVGPathElement>(null)
  const prog = useMotionValue(from)
  const [pt, setPt] = useState<[number, number]>([-20, 120])
  useEffect(() => {
    const c = animate(prog, to, { duration: reduce ? 0 : duration, ease: [0.45, 0, 0.25, 1], onComplete: onDone })
    return () => c.stop()
  }, [])
  useMotionValueEvent(prog, 'change', (v) => {
    const el = path.current
    if (!el) return
    const p = el.getPointAtLength(v * el.getTotalLength())
    setPt([p.x, p.y])
  })
  useEffect(() => {
    const el = path.current
    if (!el) return
    const p = el.getPointAtLength(from * el.getTotalLength())
    setPt([p.x, p.y])
  }, [from])
  return (
    <svg viewBox="0 0 1000 170" className="us-scene" aria-hidden>
      {[[140, 40, 150], [230, 60, 120], [600, 30, 170], [700, 50, 130], [900, 46, 140]].map(([x, y, w], i) => (
        <g key={i} className="us-peak">
          <path d={`M${x - w / 2} 140 L${x} ${y} L${x + w / 2} 140`} />
          <path d={`M${x - w * 0.12} ${y + 22} L${x} ${y} L${x + w * 0.12} ${y + 22} L${x + 4} ${y + 15} L${x - 4} ${y + 24} Z`} className="us-snow" />
        </g>
      ))}
      <path d="M0 140 H1000" className="us-ground" />
      <path ref={path} d={TRAIL} className="us-trail__ghost" />
      <motion.path d={TRAIL} className="us-trail" style={{ pathLength: prog }} />
      <g transform="translate(958 100)" className="us-flag">
        <path d="M0 0 V-38" />
        <motion.path d="M0 -38 L24 -31 L0 -24 Z" className="us-flag__cloth" initial={false} animate={{ scaleX: flag ? 1 : 0, rotate: flag ? 0 : -30 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }} style={{ transformBox: 'fill-box', transformOrigin: 'left center' }} />
      </g>
      <g transform={`translate(${pt[0]} ${pt[1]})`}>
        <circle r={16} className="us-walker__ring" />
        <circle r={9} className="us-walker" />
      </g>
    </svg>
  )
}

/** The leaving half: rolls up over the page, walks the first half of the trail, then reloads. */
export function LeavingSheet({ changes }: { changes: string[] }) {
  useEffect(() => {
    markLeaving(changes)
    const t = window.setTimeout(() => window.location.reload(), 1500)
    return () => window.clearTimeout(t)
  }, [])
  return createPortal(
    <motion.div className="us" initial={{ clipPath: 'inset(100% 0 0 0 round 0)' }} animate={{ clipPath: 'inset(0% 0 0 0 round 0)' }} transition={{ duration: 0.6, ease: [0.76, 0, 0.24, 1] }}>
      <div className="us-in">
        <motion.span className="us-mark" initial={{ y: 24, rotate: -20, scale: 0.6 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.25 }}><Mark size={56} /></motion.span>
        <motion.b className="us-title" initial={{ y: 16 }} animate={{ y: 0 }} transition={{ delay: 0.3, type: 'spring', stiffness: 260, damping: 20 }}>Fetching the new trail<span className="us-dots"><i>.</i><i>.</i><i>.</i></span></motion.b>
        <Scene from={0} to={HALF} duration={1.6} flag={false} />
      </div>
    </motion.div>,
    document.body,
  )
}

/** The arriving half: picks up where the walk stopped, raises the flag, then rolls away. */
export function ArrivingSheet({ arrival, onDone }: { arrival: Arrival; onDone: () => void }) {
  const [there, setThere] = useState(false)
  const [leave, setLeave] = useState(false)
  useEffect(() => {
    document.getElementById('th-pre')?.remove()
  }, [])
  useEffect(() => {
    if (!there) return
    const t = window.setTimeout(() => setLeave(true), 1500 + arrival.changes.length * 250)
    return () => window.clearTimeout(t)
  }, [there])
  return createPortal(
    <motion.div className="us" initial={{ clipPath: 'inset(0% 0 0% 0)' }} animate={{ clipPath: leave ? 'inset(0% 0 100% 0)' : 'inset(0% 0 0% 0)' }} transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }} onAnimationComplete={() => leave && onDone()}>
      <div className="us-in">
        <span className="us-mark"><Mark size={56} /></span>
        <b className="us-title">
          {there ? (
            <motion.span key="here" initial={{ y: 14, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }} style={{ display: 'inline-block' }}>You’re on the new trail</motion.span>
          ) : (
            <>Fetching the new trail<span className="us-dots"><i>.</i><i>.</i><i>.</i></span></>
          )}
        </b>
        <Scene from={HALF} to={1} duration={0.9} flag={there} onDone={() => setThere(true)} />
        <ol className="us-changes">
          {there && arrival.changes.map((c, i) => (
            <motion.li key={c + i} initial={{ x: -18, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 300, damping: 22 }}>{c}</motion.li>
          ))}
        </ol>
      </div>
    </motion.div>,
    document.body,
  )
}
