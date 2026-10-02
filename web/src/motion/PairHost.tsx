import { AnimatePresence, motion, useMotionValue, useSpring } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { dismissDrop, isLink, onPairMessage, post, resumeHosting, unpair, usePair, type Drop } from '../lib/pair'
import { chime, notify } from '../lib/toast'

/* The desktop half of a pairing, mounted once for the whole app so the link survives moving between pages. It acts
   on what the phone sends (go to a page, ask, scroll, point, ring, pass text), tells the phone which page is open,
   and keeps a small tether on the right edge of the screen, the side the phone "lives" on: a handle that shows the
   link is alive, a drawer to send things back, and the cards the phone passed across. */

const EASE = [0.22, 1, 0.36, 1] as const

export function PhoneGlyph({ size = 18, live = false }: { size?: number; live?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={7} y={2.5} width={10} height={19} rx={2.6} />
      <path d="M11 18.5 H13" />
      {live && <motion.path d="M19.5 8 Q21.5 12 19.5 16" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1], pathOffset: [0, 0, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />}
    </svg>
  )
}

/** The phone's laser dot: springs after the deltas the phone sends, rings out on a tap, tucks away when idle. */
function Pointer() {
  const x = useMotionValue(window.innerWidth / 2)
  const y = useMotionValue(window.innerHeight / 2)
  const sx = useSpring(x, { stiffness: 520, damping: 34, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 520, damping: 34, mass: 0.6 })
  const [on, setOn] = useState(false)
  const [taps, setTaps] = useState<{ id: number; x: number; y: number }[]>([])
  const idle = useRef(0)
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t !== 'point' && m.t !== 'tap') return
        window.clearTimeout(idle.current)
        idle.current = window.setTimeout(() => setOn(false), 2600)
        if (!on && m.t === 'point') {
          // wake where it was left, not where it was flung
          setOn(true)
        }
        if (m.t === 'point') {
          x.set(Math.max(8, Math.min(window.innerWidth - 8, x.get() + m.dx * 2.2)))
          y.set(Math.max(8, Math.min(window.innerHeight - 8, y.get() + m.dy * 2.2)))
        } else {
          setOn(true)
          const id = Date.now()
          setTaps((t) => [...t, { id, x: x.get(), y: y.get() }])
          window.setTimeout(() => setTaps((t) => t.filter((k) => k.id !== id)), 900)
        }
      }),
    [on, x, y],
  )
  return (
    <>
      <motion.div className="ph-laser" style={{ x: sx, y: sy }} initial={false} animate={{ scale: on ? 1 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }} aria-hidden>
        <span />
      </motion.div>
      {taps.map((t) => (
        <motion.span key={t.id} className="ph-tap" style={{ left: t.x, top: t.y }} initial={{ scale: 0.2, borderWidth: 10 }} animate={{ scale: 3.2, borderWidth: 0 }} transition={{ duration: 0.8, ease: EASE }} aria-hidden />
      ))}
    </>
  )
}

/** Scroll the page by what the phone sends, eased so a flick glides instead of jumping. */
function useRemoteScroll() {
  useEffect(() => {
    let pending = 0
    let raf = 0
    const step = () => {
      const d = pending * 0.22
      pending -= d
      window.scrollBy(0, d)
      raf = Math.abs(pending) > 0.5 ? requestAnimationFrame(step) : 0
    }
    const off = onPairMessage((m) => {
      if (m.t !== 'scroll') return
      pending += m.dy * 3
      if (!raf) raf = requestAnimationFrame(step)
    })
    return () => {
      off()
      cancelAnimationFrame(raf)
    }
  }, [])
}

function DropCard({ d }: { d: Drop }) {
  const link = isLink(d.text)
  const copy = () => navigator.clipboard?.writeText(d.text).then(() => notify.ok('Copied', 'From your phone'), () => undefined)
  return (
    <motion.div
      layout
      className="ph-drop"
      initial={{ x: 340, rotate: 6 }}
      animate={{ x: 0, rotate: 0 }}
      exit={{ x: 360, rotate: 4, transition: { duration: 0.32, ease: [0.76, 0, 0.24, 1] } }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
    >
      <span className="ph-drop__from"><PhoneGlyph size={13} /> From your phone</span>
      <p className={link ? 'mono' : ''}>{d.text.length > 220 ? `${d.text.slice(0, 210)}…` : d.text}</p>
      <div className="ph-drop__acts">
        <button onClick={copy}>Copy</button>
        {link && <a href={d.text.trim()} target="_blank" rel="noreferrer noopener" data-cursor="Open the link">Open ↗</a>}
        <button className="is-quiet" onClick={() => dismissDrop(d.id)} aria-label="Dismiss">Done</button>
      </div>
    </motion.div>
  )
}

function Dock() {
  const pair = usePair()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const live = pair.status === 'linked'
  const incoming = pair.drops.filter((d) => d.from === 'phone')
  const sendText = () => {
    const t = text.trim()
    if (!t) return
    post({ t: 'drop', text: t })
    setText('')
    notify.ok('Sent to your phone', t.length > 60 ? `${t.slice(0, 56)}…` : t)
  }
  return (
    <div className="ph-dock">
      <AnimatePresence initial={false}>
        {incoming.slice(0, 3).map((d) => (
          <DropCard key={d.id} d={d} />
        ))}
      </AnimatePresence>
      <motion.div className={`ph-tether ${live ? 'is-live' : ''}`} layout transition={{ type: 'spring', stiffness: 340, damping: 30 }}>
        <button className="ph-tether__handle" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-cursor={open ? 'Fold the drawer' : 'Your phone'}>
          <PhoneGlyph live={live} />
          <span className="ph-tether__cord" aria-hidden>
            <motion.i animate={live ? { x: ['-100%', '100%'] } : { x: '-100%' }} transition={live ? { duration: 1.6, repeat: Infinity, ease: 'linear' } : { duration: 0.3 }} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div className="ph-drawer" initial={{ width: 0 }} animate={{ width: 'auto' }} exit={{ width: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}>
              <div className="ph-drawer__in">
                <b>{live ? `Linked to ${pair.peer || 'your phone'}` : pair.status === 'lost' ? 'Phone out of reach' : 'Waiting for your phone'}</b>
                <form onSubmit={(e) => { e.preventDefault(); sendText() }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text or a link for your phone" aria-label="Send to phone" disabled={!live} />
                  <button type="submit" disabled={!live || !text.trim()}>Send</button>
                </form>
                <div className="ph-drawer__row">
                  <button disabled={!live} onClick={() => post({ t: 'drop', text: window.location.href, title: document.title })}>Send this page</button>
                  <button disabled={!live} onClick={() => post({ t: 'ring' })}>Buzz it</button>
                  <button className="is-quiet" onClick={() => { unpair(); setOpen(false) }}>Unpair</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

export function PairHost() {
  const pair = usePair()
  const navigate = useNavigate()
  const location = useLocation()
  const host = pair.role === 'host'

  useEffect(() => resumeHosting(), [])
  useRemoteScroll()

  useEffect(() => {
    if (host && pair.status === 'linked') post({ t: 'page', page: location.pathname })
  }, [host, pair.status, location.pathname])

  // Say so when the link comes up or drops, wherever the person is.
  const was = useRef(pair.status)
  useEffect(() => {
    if (host && pair.status === 'linked' && was.current !== 'linked') {
      chime('success')
      if (location.pathname !== '/pair') notify.ok(`${pair.peer || 'Your phone'} is linked`, 'It can steer, point and pass things across.')
    }
    if (host && pair.status === 'lost' && was.current === 'linked') notify.warn('Phone out of reach', 'It links again on its own when it comes back.')
    was.current = pair.status
  }, [host, pair.status, pair.peer, location.pathname])

  useEffect(() => {
    if (!host) return
    return onPairMessage((m) => {
      if (m.t === 'go') navigate(m.to)
      if (m.t === 'ask') {
        const q = m.q.trim().slice(0, 500)
        if (q.length >= 3) navigate(`/app/ask?q=${encodeURIComponent(q)}&run=1&n=${Date.now() % 100000}`)
      }
      if (m.t === 'ring') {
        chime('info')
        document.documentElement.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' })
      }
      if (m.t === 'drop') chime('job')
    })
  }, [host, navigate])

  if (!host) return null
  return (
    <>
      <Pointer />
      {location.pathname !== '/pair' && pair.status !== 'waiting' && <Dock />}
    </>
  )
}
