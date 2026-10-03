import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, useVelocity } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { dismissDrop, holdRemote, isLink, onPairMessage, post, resumeHosting, unpair, usePair, type Drop } from '../lib/pair'
import { chime, notify } from '../lib/toast'
import { buzz } from './PairSplash'

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

const PRESSABLE = 'a, button, [role="button"], [role="option"], [role="menuitem"], [role="radio"], [role="switch"], [role="tab"], summary, label, select, [data-cursor]'
const TYPEABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"]'

/** Press whatever sits under the phone's cursor, the way a real click would reach it. */
function pressAt(x: number, y: number) {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null
  if (!hit) return
  const field = hit.closest<HTMLElement>(TYPEABLE)
  if (field) return field.focus()
  const el = hit.closest<HTMLElement>(PRESSABLE) ?? hit
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0 }
  el.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mousedown', init))
  el.dispatchEvent(new PointerEvent('pointerup', { ...init, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', init))
  el.click()
}

// what the phone's cursor is over, so menus and anything else that lights up under a mouse lights up under it too
let hovered: Element | null = null
function hover(x: number, y: number) {
  const el = document.elementFromPoint(x, y)
  if (el === hovered) return
  const init = { bubbles: true, composed: true, clientX: x, clientY: y }
  if (hovered) {
    hovered.dispatchEvent(new PointerEvent('pointerout', { ...init, pointerType: 'mouse', relatedTarget: el }))
    hovered.dispatchEvent(new MouseEvent('mouseout', { ...init, relatedTarget: el }))
  }
  if (el) {
    el.dispatchEvent(new PointerEvent('pointerover', { ...init, pointerType: 'mouse', relatedTarget: hovered }))
    el.dispatchEvent(new MouseEvent('mouseover', { ...init, relatedTarget: hovered }))
  }
  hovered = el
}

type Caret = { node: Node; offset: number }
type CaretDoc = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }

/** Where a text caret would land at a point, for selecting by dragging the phone's cursor. */
function caretAt(x: number, y: number): Caret | null {
  const d = document as CaretDoc
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y)
    return p ? { node: p.offsetNode, offset: p.offset } : null
  }
  const r = document.caretRangeFromPoint?.(x, y)
  return r ? { node: r.startContainer, offset: r.startOffset } : null
}

function fire(x: number, y: number, kind: 'down' | 'move' | 'up') {
  const el = document.elementFromPoint(x, y)
  if (!el) return
  const init = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: kind === 'up' ? 0 : 1 }
  el.dispatchEvent(new PointerEvent(`pointer${kind}`, { ...init, pointerType: 'mouse', isPrimary: true }))
  el.dispatchEvent(new MouseEvent(`mouse${kind}`, init))
}

/** The phone's cursor: the Trailhead teardrop in orange with the phone's name tagged under it. It springs after the
 *  deltas the phone sends, swings a little as it travels, squishes and rings out on a tap (which presses what is
 *  under it), and tucks away when the phone goes quiet. Held down (a long press on the phone) it drags, selecting
 *  the text it passes over; a two-finger tap opens a menu where it stands. */
function Pointer({ name }: { name: string }) {
  const x = useMotionValue(window.innerWidth / 2)
  const y = useMotionValue(window.innerHeight / 2)
  const sx = useSpring(x, { stiffness: 520, damping: 34, mass: 0.6 })
  const sy = useSpring(y, { stiffness: 520, damping: 34, mass: 0.6 })
  const lean = useSpring(useTransform(useVelocity(sx), (v) => Math.max(-22, Math.min(22, -v / 90))), { stiffness: 170, damping: 8, mass: 0.8 })
  const [on, setOn] = useState(false)
  const [down, setDown] = useState(false)
  const [grab, setGrab] = useState(false)
  const [menu, setMenu] = useState<{ id: number; x: number; y: number; link: string; picked: string } | null>(null)
  const [taps, setTaps] = useState<{ id: number; x: number; y: number }[]>([])
  const idle = useRef(0)
  const anchor = useRef<Caret | null>(null)
  const grabbing = useRef(false)
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t !== 'point' && m.t !== 'tap' && m.t !== 'grab' && m.t !== 'menu') return
        window.clearTimeout(idle.current)
        idle.current = window.setTimeout(() => setOn(false), grabbing.current ? 30000 : 4000)
        setOn(true)
        const at = () => ({ x: x.get(), y: y.get() })
        if (m.t === 'point') {
          x.set(Math.max(4, Math.min(window.innerWidth - 4, x.get() + m.dx * 2.2)))
          y.set(Math.max(4, Math.min(window.innerHeight - 4, y.get() + m.dy * 2.2)))
          hover(x.get(), y.get())
          const hot = document.elementFromPoint(x.get(), y.get())?.closest('.ph-menu button')
          document.querySelectorAll('.ph-menu .is-hot').forEach((b) => b !== hot && b.classList.remove('is-hot'))
          hot?.classList.add('is-hot')
          if (grabbing.current) {
            const p = at()
            fire(p.x, p.y, 'move')
            const focus = caretAt(p.x, p.y)
            if (anchor.current && focus) window.getSelection()?.setBaseAndExtent(anchor.current.node, anchor.current.offset, focus.node, focus.offset)
            // nudge the page along while selecting near its top or bottom edge
            if (p.y > window.innerHeight - 40) window.scrollBy(0, 18)
            else if (p.y < 40) window.scrollBy(0, -18)
          }
          return
        }
        if (m.t === 'grab') {
          const p = at()
          grabbing.current = m.on
          setGrab(m.on)
          if (m.on) {
            setMenu(null)
            const c = caretAt(p.x, p.y)
            anchor.current = c && c.node.nodeType === Node.TEXT_NODE ? c : null
            window.getSelection()?.removeAllRanges()
            fire(p.x, p.y, 'down')
          } else {
            fire(p.x, p.y, 'up')
            anchor.current = null
          }
          return
        }
        if (m.t === 'menu') {
          const p = at()
          const hit = document.elementFromPoint(p.x, p.y)
          // a page with its own right-click menu gets the event first
          const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, clientX: p.x, clientY: p.y, button: 2 })
          if (hit && !hit.dispatchEvent(ev)) return
          const link = hit?.closest<HTMLAnchorElement>('a[href]')?.href ?? ''
          setMenu({ id: Date.now(), ...p, link, picked: window.getSelection()?.toString().trim() ?? '' })
          return
        }
        const p = at()
        const id = Date.now()
        setDown(true)
        window.setTimeout(() => setDown(false), 140)
        setTaps((t) => [...t, { id, ...p }])
        window.setTimeout(() => setTaps((t) => t.filter((k) => k.id !== id)), 800)
        pressAt(p.x, p.y)
      }),
    [x, y],
  )
  return (
    <>
      <motion.div className="ph-cursor" style={{ x: sx, y: sy }} initial={false} animate={{ scale: on ? 1 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }} aria-hidden>
        <motion.div style={{ rotate: lean, originX: 0, originY: 0 }}>
          <motion.span className={`ph-cursor__body ${grab ? 'is-grab' : ''}`} animate={{ scale: down ? 0.72 : grab ? 0.82 : 1, rotate: down ? -12 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 12 }} />
          <motion.span className="ph-cursor__tag" animate={{ y: down ? 3 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
            <PhoneGlyph size={12} /> {grab ? `${name} · selecting` : name}
          </motion.span>
        </motion.div>
      </motion.div>
      {taps.map((t) => (
        <motion.span key={t.id} className="ph-tap" style={{ left: t.x, top: t.y }} initial={{ scale: 0.2, borderWidth: 8 }} animate={{ scale: 2.6, borderWidth: 0 }} transition={{ duration: 0.7, ease: EASE }} aria-hidden />
      ))}
      <AnimatePresence>{menu && <RemoteMenu key={menu.id} {...menu} onClose={() => setMenu(null)} />}</AnimatePresence>
    </>
  )
}

/** The menu a right click from the phone opens where its cursor stands. The phone picks from it by pointing and
 *  tapping, like anything else on the page; a click with the mouse works too. */
function RemoteMenu({ x, y, link, picked, onClose }: { x: number; y: number; link: string; picked: string; onClose: () => void }) {
  const navigate = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', away, true)
      document.addEventListener('scroll', onClose, true)
    }, 50)
    window.addEventListener('keydown', key)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  const copy = (t: string, what: string) =>
    navigator.clipboard?.writeText(t).then(() => notify.ok(`${what} copied`), () => notify.warn('Could not copy', 'The browser wants a click on this screen first.'))
  const inside = link && new URL(link).origin === window.location.origin
  const items: { id: string; label: string; glyph: string; run: () => void }[] = [
    ...(picked
      ? [
          { id: 'copy', label: 'Copy selection', glyph: 'M8 8 H19 V20 H8 Z M5 16 V4 H16', run: () => copy(picked, 'Selection') },
          { id: 'give', label: 'Send selection to phone', glyph: 'M7 2.5 H17 V21.5 H7 Z M10 9 L12 7 L14 9 M12 7 V14', run: () => post({ t: 'drop', text: picked.slice(0, 4000) }) },
        ]
      : []),
    ...(link
      ? [
          { id: 'open', label: inside ? 'Go to link' : 'Open link here', glyph: 'M14 4 H20 V10 M20 4 L11 13 M18 14 V20 H4 V6 H10', run: () => (inside ? navigate(new URL(link).pathname + new URL(link).search) : window.location.assign(link)) },
          { id: 'link', label: 'Send link to phone', glyph: 'M10 14 A4 4 0 0 0 16 14 L19 11 A4 4 0 0 0 13 5 L12 6 M14 10 A4 4 0 0 0 8 10 L5 13 A4 4 0 0 0 11 19 L12 18', run: () => post({ t: 'drop', text: link }) },
          { id: 'copylink', label: 'Copy link', glyph: 'M8 8 H19 V20 H8 Z M5 16 V4 H16', run: () => copy(link, 'Link') },
        ]
      : []),
    { id: 'back', label: 'Back', glyph: 'M19 12 H5 M11 6 L5 12 L11 18', run: () => window.history.back() },
    { id: 'fwd', label: 'Forward', glyph: 'M5 12 H19 M13 6 L19 12 L13 18', run: () => window.history.forward() },
    { id: 'page', label: 'Send this page to phone', glyph: 'M4 6 H20 V18 H4 Z M4 9.5 H20', run: () => post({ t: 'drop', text: window.location.href, title: document.title }) },
    { id: 'reload', label: 'Reload', glyph: 'M20 12 A8 8 0 1 1 17 5.8 M20 4 V9 H15', run: () => window.location.reload() },
  ]
  const W = 236
  const H = items.length * 38 + 16
  const left = Math.min(x + 6, window.innerWidth - W - 10)
  const top = y + H + 10 > window.innerHeight ? Math.max(10, y - H - 6) : y + 6
  return (
    <motion.div
      ref={box}
      className="ph-menu"
      role="menu"
      style={{ left, top, width: W, transformOrigin: `${x - left}px ${y - top}px` }}
      initial={{ scale: 0.3, rotate: -6 }}
      animate={{ scale: 1, rotate: 0 }}
      exit={{ scale: 0.5, transition: { duration: 0.14 } }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
    >
      {items.map((it, i) => (
        <motion.button
          key={it.id}
          role="menuitem"
          initial={{ x: -14 }}
          animate={{ x: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 24, delay: 0.03 + i * 0.025 }}
          onClick={() => {
            it.run()
            onClose()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden><path d={it.glyph} /></svg>
          {it.label}
        </motion.button>
      ))}
    </motion.div>
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

// what this screen sent lately, kept across pages so it can be sent again in a click
let sentLog: { id: string; text: string; title?: string }[] = []

const DRAWER_W = 314
const DOCK_BEADS = ['var(--orange)', 'var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--violet)']

type Act = { id: string; label: string; sub: string; bg: string; glyph: string; run: () => void; off?: boolean; on?: boolean }

/** What the dock can do, as keys: each a pastel square with an ink outline that sinks when pressed. */
function DockKey({ a, i }: { a: Act; i: number }) {
  const [fired, setFired] = useState(0)
  return (
    <motion.button
      className={`ph-key ${a.on ? 'is-on' : ''}`}
      style={{ '--key': a.bg, '--i': i } as React.CSSProperties}
      disabled={a.off}
      onClick={() => {
        a.run()
        setFired((f) => f + 1)
      }}
      initial={{ scale: 0.4, rotate: i % 2 ? 10 : -10 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.08 + i * 0.035 }}
      data-cursor={a.sub}
    >
      <motion.svg key={fired} viewBox="0 0 24 24" aria-hidden initial={fired ? { scale: 0.5, rotate: -20 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
        <path d={a.glyph} />
      </motion.svg>
      <b>{a.label}</b>
      <small>{a.sub}</small>
    </motion.button>
  )
}

function Dock() {
  const pair = usePair()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const picked = useRef('')
  const live = pair.status === 'linked'
  const lost = pair.status === 'lost'
  const name = pair.peer || 'your phone'
  const incoming = pair.drops.filter((d) => d.from === 'phone')
  const [sent, setSent] = useState(sentLog)

  // Alt+P opens the dock from anywhere, Escape folds it
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyP') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    // remember what was selected before a click in the dock clears it
    const sel = () => {
      const t = window.getSelection()?.toString().trim() ?? ''
      if (t) picked.current = t
    }
    window.addEventListener('keydown', key)
    document.addEventListener('selectionchange', sel)
    return () => {
      window.removeEventListener('keydown', key)
      document.removeEventListener('selectionchange', sel)
    }
  }, [])

  const give = (t: string, title?: string, what = 'Sent') => {
    post({ t: 'drop', text: t.slice(0, 4000), ...(title ? { title } : {}) })
    sentLog = [{ id: `${Date.now()}`, text: t, title }, ...sentLog.filter((x) => x.text !== t)].slice(0, 3)
    setSent(sentLog)
    notify.ok(`${what} to ${name}`, t.length > 60 ? `${t.slice(0, 56)}…` : t)
  }
  const sendText = () => {
    const t = text.trim()
    if (!t) return
    give(t)
    setText('')
  }
  const acts: Act[] = [
    { id: 'page', label: 'This page', sub: 'Its link, ready to open on the phone', bg: 'var(--sky)', glyph: 'M4 6 H20 V18 H4 Z M4 9.5 H20 M7 7.8 H7.1', run: () => give(window.location.href, document.title, 'Page sent'), off: !live },
    { id: 'sel', label: 'Selection', sub: 'The text you have highlighted', bg: 'var(--lilac)', glyph: 'M5 7 H19 M5 12 H14 M5 17 H11 M16 14 V20 M14 15 H18', run: () => (picked.current ? give(picked.current) : notify.warn('Nothing selected', 'Highlight some text on the page first.')), off: !live },
    {
      id: 'clip',
      label: 'Clipboard',
      sub: 'Whatever you last copied',
      bg: 'var(--mint)',
      glyph: 'M9 4 H15 V7 H9 Z M7 5.5 H5.5 V20 H18.5 V5.5 H17 M9 12 H15 M9 16 H13',
      run: () =>
        navigator.clipboard?.readText().then(
          (t) => (t.trim() ? give(t.trim()) : notify.warn('The clipboard is empty')),
          () => notify.warn('Could not read the clipboard', 'Allow it in the browser, or paste into the box below.'),
        ),
      off: !live,
    },
    { id: 'buzz', label: 'Buzz', sub: 'Ring the phone to find it', bg: 'var(--butter)', glyph: 'M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z M10 21 H14', run: buzz, off: !live },
    {
      id: 'hold',
      label: pair.held ? 'Resume' : 'Pause',
      sub: pair.held ? 'Give the phone its controls back' : 'Stop the phone steering this screen',
      bg: 'var(--peach)',
      glyph: pair.held ? 'M8 5 L19 12 L8 19 Z' : 'M8 5 V19 M16 5 V19',
      run: () => {
        holdRemote(!pair.held)
        notify.ok(pair.held ? 'Remote resumed' : 'Remote paused', pair.held ? `${name} can steer again.` : 'Passing and buzzing still work.')
      },
      off: !live,
      on: pair.held,
    },
    { id: 'pair', label: 'Pair page', sub: 'The full view of the link', bg: 'var(--limeade)', glyph: 'M7 2.5 H17 V21.5 H7 Z M11 18.5 H13 M3 9 L5 11 L3 13 M21 9 L19 11 L21 13', run: () => navigate('/pair') },
  ]

  return (
    <div className="ph-dock">
      <AnimatePresence initial={false}>
        {incoming.slice(0, 3).map((d) => (
          <DropCard key={d.id} d={d} />
        ))}
      </AnimatePresence>
      <div className={`ph-tether is-${pair.status} ${pair.held ? 'is-held' : ''}`}>
        <button className="ph-tether__handle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-keyshortcuts="Alt+P" data-cursor={open ? 'Fold the drawer · Esc' : 'Your phone · Alt+P'}>
          <PhoneGlyph live={live} />
          <span className="ph-tether__beads" aria-hidden>
            {DOCK_BEADS.map((c, k) => (
              <motion.i
                key={`${pair.status}-${pair.held}-${k}`}
                style={{ background: live && !pair.held ? c : lost ? 'var(--stop)' : 'var(--dim)' }}
                animate={live && !pair.held ? { x: [0, -5, 0], scale: [1, 1.3, 1] } : lost ? { x: 4, rotate: 40 } : { scale: [1, 0.7, 1] }}
                transition={live && !pair.held ? { duration: 0.9, repeat: Infinity, repeatDelay: 0.6, delay: k * 0.1 } : lost ? { type: 'spring', stiffness: 300, damping: 12, delay: k * 0.05 } : { duration: 1.4, repeat: Infinity, delay: k * 0.15 }}
              />
            ))}
          </span>
          {pair.held && <motion.span className="ph-tether__held" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>II</motion.span>}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div className="ph-drawer" initial={{ width: 0 }} animate={{ width: DRAWER_W }} exit={{ width: 0, transition: { duration: 0.28, ease: [0.76, 0, 0.24, 1] } }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
              <div className="ph-drawer__in">
                <div className="ph-drawer__head">
                  <small>{live ? (pair.held ? 'Paused' : 'Linked to') : lost ? 'Out of reach' : 'Waiting for'}</small>
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.b key={name} initial={{ y: 20, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -20, rotateX: 80, transition: { duration: 0.22, ease: [0.5, 0, 0.75, 0] } }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>{pair.peer || 'Your phone'}</motion.b>
                  </AnimatePresence>
                  <span className="ph-drawer__kbd"><kbd>Alt</kbd><kbd>P</kbd></span>
                </div>
                <div className="ph-keys">
                  {acts.map((a, i) => <DockKey key={a.id} a={a} i={i} />)}
                </div>
                <form className="ph-send" onSubmit={(e) => { e.preventDefault(); sendText() }}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text or a link for the phone" aria-label="Send to phone" disabled={!live} />
                  <motion.button type="submit" disabled={!live || !text.trim()} whileTap={{ x: 6 }} aria-label="Send">
                    <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12 H19 M13 6 L19 12 L13 18" /></svg>
                  </motion.button>
                </form>
                {sent.length > 0 && (
                  <div className="ph-sent">
                    <small>Sent lately</small>
                    {sent.map((d) => (
                      <button key={d.id} onClick={() => give(d.text, d.title, 'Sent again')} disabled={!live} data-cursor="Send it again">
                        <span>{d.title || d.text}</span>
                        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12 A8 8 0 1 0 7 6 M4 4 V8 H8" /></svg>
                      </button>
                    ))}
                  </div>
                )}
                <button className="ph-cut" onClick={() => { unpair(); setOpen(false) }}>Unpair {name}</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
    if (host && pair.status === 'linked' && was.current === 'lost') notify.ok(`${pair.peer || 'Your phone'} is back`, 'The link picked up where it left off.')
    if (host && pair.status === 'lost' && was.current === 'linked') notify.warn('Phone out of reach', 'It links again on its own when it comes back.')
    was.current = pair.status
  }, [host, pair.status, pair.peer])

  useEffect(() => {
    if (!host) return
    return onPairMessage((m) => {
      if (m.t === 'go') navigate(m.to)
      if (m.t === 'ask') {
        const q = m.q.trim().slice(0, 500)
        if (q.length >= 3) navigate(`/app/ask?q=${encodeURIComponent(q)}&run=1&n=${Date.now() % 100000}`)
      }
      if (m.t === 'drop') chime('job')
    })
  }, [host, navigate])

  if (!host) return null
  return (
    <>
      <Pointer name={pair.peer || 'Phone'} />
      {location.pathname !== '/pair' && pair.status !== 'waiting' && <Dock />}
    </>
  )
}
