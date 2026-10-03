import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PhoneGlyph } from '../motion/PairHost'
import { buzz, Letters, ScreenGlyph } from '../motion/PairSplash'
import { dismissDrop, isLink, joinAsPhone, onPairEvent, onPairMessage, PAIR_PAGES, pagePath, post, unpair, usePair } from '../lib/pair'
import { chime, notify } from '../lib/toast'
import { FLIP_OUT, KIND_COLOR, LinkLine, Since, SPRING, UseArt } from './pairParts'
import './pair-phone.css'

/* The phone half of a pairing: a remote for the computer it scanned. Keys that sink flat while the link is down and
   pop back up in a wave when it returns, a dark pad where your finger drags the same orange cursor the computer shows,
   a scroll wheel whose ridges roll under your thumb, and two cards for asking and passing things across. Whatever
   leaves the phone arcs up into the computer in the header, and the header says what it just did. */

const POP = { type: 'spring', stiffness: 420, damping: 18 } as const

/* ---------------------------------------------------------------- what the phone just did */

type Echo = { id: number; kind: string; text: string }
const echoes = new Set<(e: Echo) => void>()
function echo(kind: string, text: string) {
  const e = { id: Date.now() + Math.random(), kind, text }
  echoes.forEach((h) => h(e))
}

/* ---------------------------------------------------------------- flights into the header */

type Flight = { id: number; x: number; y: number; color: string; label: string }
const flights = new Set<(f: Flight) => void>()
/** Send a chip from where it was pressed up into the computer tile in the header. */
function launch(from: Element | null, color: string, label: string) {
  if (!from) return
  const r = from.getBoundingClientRect()
  const f = { id: Date.now() + Math.random(), x: r.left + r.width / 2, y: r.top + r.height / 2, color, label }
  flights.forEach((h) => h(f))
}

function Flights() {
  const [list, setList] = useState<Flight[]>([])
  useEffect(() => {
    const h = (f: Flight) => setList((l) => [...l.slice(-4), f])
    flights.add(h)
    return () => {
      flights.delete(h)
    }
  }, [])
  return createPortal(
    <>
      {list.map((f) => (
        <FlightChip key={f.id} f={f} onDone={() => setList((l) => l.filter((x) => x.id !== f.id))} />
      ))}
    </>,
    document.body,
  )
}

function FlightChip({ f, onDone }: { f: Flight; onDone: () => void }) {
  const [to] = useState(() => {
    const t = document.querySelector('.pp-head .pr-link__tile')?.getBoundingClientRect()
    return t ? { x: t.left + t.width / 2, y: t.top + t.height / 2 } : { x: 40, y: 60 }
  })
  const peak = Math.min(f.y, to.y) - 70
  return (
    <motion.span
      className="pp-flight"
      style={{ background: f.color }}
      initial={{ x: f.x, y: f.y, scale: 0.6, rotate: 0 }}
      animate={{ x: [f.x, (f.x + to.x) / 2 + 50, to.x], y: [f.y, peak, to.y], scale: [0.6, 1.1, 0.2], rotate: [0, -10, 24] }}
      transition={{ duration: 0.8, times: [0, 0.42, 1], ease: [0.45, 0, 0.25, 1] }}
      onAnimationComplete={() => {
        document.querySelector('.pp-head .pr-link__tile')?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.3) rotate(-10deg)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }],
          { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
        )
        onDone()
      }}
      aria-hidden
    >
      {f.label}
    </motion.span>
  )
}

/* ---------------------------------------------------------------- header */

/** The top of the phone: a dark card with both devices and the line between them. Its words flip, and for a moment
 *  after each move the last line says what the phone just did. */
function Tether({ status, peer }: { status: string; peer: string }) {
  const pair = usePair()
  const [last, setLast] = useState<Echo | null>(null)
  useEffect(() => {
    const h = (e: Echo) => setLast(e)
    echoes.add(h)
    return () => {
      echoes.delete(h)
    }
  }, [])
  useEffect(() => {
    if (!last) return
    const t = window.setTimeout(() => setLast(null), 2400)
    return () => window.clearTimeout(t)
  }, [last])
  const linked = status === 'linked'
  const kicker = linked ? 'Linked to' : status === 'lost' ? 'Lost sight of' : 'Reaching'
  const name = peer || 'your computer'
  const held = linked && pair.held
  const line = last ? last.id : held ? 'held' : linked ? 'since' : status
  return (
    <motion.header className={`pp-head is-${status}`} initial={{ y: -40, clipPath: 'inset(0 0 100% 0 round 26px)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0 round 26px)', transitionEnd: { clipPath: 'none' } }} transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
      <div className="pp-head__words">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.small key={kicker} initial={{ y: 14, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -14, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>{kicker}</motion.small>
        </AnimatePresence>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.b key={name} initial={{ y: 26, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -26, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>{name}</motion.b>
        </AnimatePresence>
        <span className="pp-head__line">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={line} initial={{ y: 16, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -16, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>
              {last ? (
                <>
                  <i style={{ background: KIND_COLOR[last.kind] ?? 'var(--yellow)' }} />
                  {last.text}
                </>
              ) : held ? (
                <>
                  <i style={{ background: 'var(--yellow)' }} />
                  Paused by {name} · passing and buzzing still work
                </>
              ) : linked && pair.since ? (
                <>since <Since at={pair.since} /></>
              ) : status === 'lost' ? (
                'retrying on its own'
              ) : (
                'saying hello…'
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>
      <LinkLine status={status} peer={peer} phone bare />
    </motion.header>
  )
}

/* ---------------------------------------------------------------- sections */

function Section({ i, title, meta, children, className = '', style }: { i: number; title: string; meta?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <motion.section
      className={`pp-sec ${className}`}
      style={style}
      initial={{ y: 48, clipPath: 'inset(0 0 100% 0 round 26px)' }}
      animate={{ y: 0, clipPath: 'inset(-20px -20px -20px -20px round 26px)', transitionEnd: { clipPath: 'none' } }}
      transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.12 + i * 0.09 }}
    >
      <div className="pp-sec__head">
        <h2>{title}</h2>
        {meta}
      </div>
      {children}
    </motion.section>
  )
}

/** A flipping label: the word slides up and over when it changes. */
function Flip({ text, className }: { text: string; className?: string }) {
  return (
    <span className={`pp-flip ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} initial={{ y: '100%', rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: '-100%', rotateX: 70, transition: FLIP_OUT }} transition={SPRING}>
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/* ---------------------------------------------------------------- steer keys */

const KEY_BG = ['var(--sky)', 'var(--lilac)', 'var(--mint)', 'var(--peach)', 'var(--limeade)', 'var(--butter)', 'var(--lilac)', 'var(--mint)']

function Keys({ linked, page }: { linked: boolean; page: string }) {
  const here = PAIR_PAGES.find((p) => p.to === page)
  return (
    <Section i={0} title="Steer" meta={<span className="pp-sec__meta">On screen · <Flip text={here?.label ?? 'Pairing'} /></span>}>
      <div className="pp-keys">
        {PAIR_PAGES.map((p, i) => {
          const on = page === p.to
          return (
            <motion.button
              key={p.to}
              className={`pp-key ${on ? 'is-on' : ''}`}
              style={{ '--key': KEY_BG[i % KEY_BG.length], '--i': i } as React.CSSProperties}
              disabled={!linked}
              initial={{ y: 26, scale: 0.5, rotate: i % 2 ? 10 : -10 }}
              animate={{ y: 0, scale: 1, rotate: 0 }}
              transition={{ ...POP, delay: 0.3 + i * 0.045 }}
              onClick={(e) => {
                post({ t: 'go', to: p.to })
                navigator.vibrate?.(10)
                launch(e.currentTarget, KEY_BG[i % KEY_BG.length], p.label)
                echo('go', `Steered to ${p.label}`)
              }}
            >
              {on && <motion.span layoutId="pp-here" className="pp-key__here" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
              <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <motion.path key={on ? 'on' : 'off'} d={p.glyph} initial={on ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }} />
              </svg>
              <span>{p.label}</span>
            </motion.button>
          )
        })}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- pad */

type Burst = { id: number; x: number; y: number }
const SPARKS = ['var(--orange)', 'var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--violet)', '#fbf8f1']

/** One-finger drag moves this phone's cursor on the computer; a quick tap presses what it points at; the wheel on the
 *  right scrolls the page. Your finger drags an orange cursor with a short yellow trail behind it. */
function Pad({ enabled, peer, held }: { enabled: boolean; peer: string; held: boolean }) {
  const acc = useRef({ dx: 0, dy: 0, sy: 0 })
  const start = useRef<{ x: number; y: number; t: number; moved: number } | null>(null)
  // fingers on the pad, for telling a two-finger tap (right click) and a two-finger drag (scroll) from pointing
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const two = useRef<{ t: number; moved: number } | null>(null)
  const press = useRef(0)
  const [grab, setGrab] = useState<'' | 'hold' | 'lock'>('')
  const grabRef = useRef<'' | 'hold' | 'lock'>('')
  const setG = (g: '' | 'hold' | 'lock') => {
    if (!!grabRef.current !== !!g) post({ t: 'grab', on: !!g })
    grabRef.current = g
    setGrab(g)
  }
  const last = useRef({ x: 0, y: 0 })
  const cursor = useRef<HTMLSpanElement>(null)
  const trail = useRef<SVGPathElement>(null)
  const pts = useRef<{ x: number; y: number; t: number }[]>([])
  const raf = useRef(0)
  const roll = useRef(0)
  const ridges = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'' | 'point' | 'scroll'>('')
  const [touched, setTouched] = useState(false)
  const [bursts, setBursts] = useState<Burst[]>([])
  const [dir, setDir] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => {
      const a = acc.current
      if (a.dx || a.dy) post({ t: 'point', dx: Math.round(a.dx), dy: Math.round(a.dy) })
      if (a.sy) post({ t: 'scroll', dy: Math.round(a.sy) })
      acc.current = { dx: 0, dy: 0, sy: 0 }
    }, 60)
    return () => {
      window.clearInterval(t)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  // the trail keeps only the last fraction of a second of movement, so it shortens behind the finger and is gone
  // once the finger stops
  const draw = () => {
    const now = performance.now()
    pts.current = pts.current.filter((p) => now - p.t < 240)
    const p = pts.current
    trail.current?.setAttribute('d', p.length > 1 ? `M${p.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L')}` : '')
    raf.current = p.length ? requestAnimationFrame(draw) : 0
  }
  const place = (x: number, y: number) => cursor.current?.style.setProperty('translate', `${x}px ${y}px`)

  const menu = () => {
    post({ t: 'menu' })
    navigator.vibrate?.([10, 30, 10])
    echo('menu', `Right-clicked on ${peer || 'the computer'}`)
  }
  // let go of a drag if the link drops or the remote is paused mid-way
  useEffect(() => {
    if (!enabled && grabRef.current) setG('')
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const down = (kind: 'point' | 'scroll') => (e: React.PointerEvent) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (kind === 'point') {
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (fingers.current.size === 2) {
        // a second finger: this is a right click or a two-finger scroll, not pointing
        window.clearTimeout(press.current)
        two.current = { t: Date.now(), moved: 0 }
        return
      }
      if (fingers.current.size > 2) return
      window.clearTimeout(press.current)
      // held still for a moment: start dragging, which selects text on the computer
      if (!grabRef.current)
        press.current = window.setTimeout(() => {
          if (start.current && start.current.moved < 10 && fingers.current.size === 1) {
            setG('hold')
            navigator.vibrate?.(25)
            echo('tap', 'Dragging · let go to drop')
          }
        }, 420)
    }
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 }
    last.current = { x: e.clientX, y: e.clientY }
    setMode(kind)
    setTouched(true)
    if (kind === 'point') {
      const r = e.currentTarget.getBoundingClientRect()
      place(e.clientX - r.left, e.clientY - r.top)
    }
  }
  const move = (e: React.PointerEvent) => {
    if (two.current && fingers.current.has(e.pointerId)) {
      const f = fingers.current.get(e.pointerId)!
      const dy = e.clientY - f.y
      two.current.moved += Math.abs(dy) + Math.abs(e.clientX - f.x)
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (two.current.moved > 14) acc.current.sy -= dy * 0.9
      return
    }
    if (mode === 'point') fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!start.current || !mode) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    start.current.moved += Math.abs(dx) + Math.abs(dy)
    if (mode === 'point') {
      acc.current.dx += dx
      acc.current.dy += dy
      const r = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      place(x, y)
      pts.current.push({ x, y, t: performance.now() })
      if (!raf.current) raf.current = requestAnimationFrame(draw)
    } else {
      acc.current.sy -= dy * 1.6
      roll.current += dy
      ridges.current?.style.setProperty('translate', `0 ${(((roll.current % 16) + 16) % 16) - 16}px`)
      if (Math.abs(dy) > 1) setDir(dy > 0 ? -1 : 1)
    }
  }
  const up = (e: React.PointerEvent) => {
    window.clearTimeout(press.current)
    if (mode === 'point' || two.current) {
      fingers.current.delete(e.pointerId)
      if (two.current) {
        if (fingers.current.size) return
        const tw = two.current
        two.current = null
        start.current = null
        setMode('')
        if (tw.moved < 18 && Date.now() - tw.t < 450) menu()
        return
      }
    }
    const s = start.current
    if (grabRef.current === 'hold') {
      setG('')
      start.current = null
      setMode('')
      return
    }
    if (grabRef.current === 'lock' && s && s.moved < 8 && Date.now() - s.t < 260) {
      // a tap ends a locked drag rather than pressing
      setG('')
      start.current = null
      setMode('')
      return
    }
    if (s && mode === 'point' && s.moved < 8 && Date.now() - s.t < 260) {
      post({ t: 'tap' })
      navigator.vibrate?.(12)
      const r = e.currentTarget.getBoundingClientRect()
      const b = { id: Date.now(), x: e.clientX - r.left, y: e.clientY - r.top }
      setBursts((l) => [...l.slice(-3), b])
      window.setTimeout(() => setBursts((l) => l.filter((x) => x.id !== b.id)), 700)
      cursor.current?.firstElementChild?.animate([{ transform: 'rotate(-12deg) scale(1)' }, { transform: 'rotate(-12deg) scale(0.7, 0.85)' }, { transform: 'rotate(-12deg) scale(1.12)' }, { transform: 'rotate(-12deg) scale(1)' }], { duration: 380, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
      echo('tap', `Pressed on ${peer || 'the computer'}`)
    }
    start.current = null
    setMode('')
    setDir(0)
  }

  return (
    <Section i={1} title="Point and scroll" meta={<span className="pp-sec__meta">{enabled ? 'Live' : held ? 'Paused' : 'Waiting'}</span>}>
      <div className={`pp-pad ${enabled ? '' : 'is-off'}`}>
        <div className={`pp-pad__area ${mode === 'point' ? 'is-on' : ''} ${grab ? 'is-grab' : ''}`} onPointerDown={down('point')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <svg className="pp-pad__trail" aria-hidden>
            <path ref={trail} />
          </svg>
          {bursts.map((b) => (
            <span key={b.id} className="pp-pad__burst" style={{ left: b.x, top: b.y }} aria-hidden>
              <motion.i className="pp-pad__ring" initial={{ scale: 0.2, borderWidth: 10 }} animate={{ scale: 2.4, borderWidth: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
              {SPARKS.map((c, k) => {
                const a = (k / SPARKS.length) * Math.PI * 2 - Math.PI / 2
                return <motion.i key={k} className="pp-pad__spark" style={{ background: c }} initial={{ x: 0, y: 0, scale: 0 }} animate={{ x: Math.cos(a) * 42, y: Math.sin(a) * 42, scale: [0, 1.2, 0], rotate: 180 }} transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }} />
              })}
            </span>
          ))}
          <span ref={cursor} className={`pp-pad__cursor ${touched ? '' : 'is-idle'}`} aria-hidden>
            <i />
          </span>
          <AnimatePresence>
            {enabled && !touched && (
              <motion.span key="demo" className="pp-pad__demo" exit={{ scale: 0, transition: { duration: 0.2 } }} aria-hidden>
                <motion.i className="pp-pad__ghost" animate={{ left: ['24%', '58%', '70%', '70%', '42%', '24%'], top: ['62%', '30%', '46%', '46%', '70%', '62%'] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.3, 0.5, 0.62, 0.85, 1], ease: 'easeInOut' }} />
                <motion.b className="pp-pad__ghostring" animate={{ scale: [0, 0, 2.2, 2.2], borderWidth: [8, 8, 0, 0] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.5, 0.64, 1] }} />
              </motion.span>
            )}
          </AnimatePresence>
          <span className="pp-pad__hint">
            {!enabled ? (held ? `${peer || 'The computer'} paused the remote` : 'Waiting for the link') : grab ? (grab === 'lock' ? 'Dragging · tap to drop' : 'Dragging · let go to drop') : 'Drag · tap · hold to select'}
          </span>
        </div>
        <div className={`pp-pad__rail ${mode === 'scroll' ? 'is-on' : ''}`} onPointerDown={down('scroll')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Scroll the page">
          <motion.svg className="pp-pad__arrow" viewBox="0 0 24 24" animate={{ y: dir === 1 ? -5 : 0, scale: dir === 1 ? 1.25 : 1 }} transition={POP} aria-hidden>
            <path d="M6 15 L12 9 L18 15" />
          </motion.svg>
          <div className="pp-pad__wheel">
            <div ref={ridges} className="pp-pad__ridges">
              {Array.from({ length: 14 }, (_, k) => <i key={k} />)}
            </div>
          </div>
          <motion.svg className="pp-pad__arrow" viewBox="0 0 24 24" animate={{ y: dir === -1 ? 5 : 0, scale: dir === -1 ? 1.25 : 1 }} transition={POP} aria-hidden>
            <path d="M6 9 L12 15 L18 9" />
          </motion.svg>
        </div>
      </div>
      <div className="pp-padkeys">
        <button className="pp-key" style={{ '--key': 'var(--sky)', '--i': 0 } as React.CSSProperties} disabled={!enabled} onClick={menu}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M7 3 H17 A3 3 0 0 1 20 6 V15 A7 7 0 0 1 4 15 V6 A3 3 0 0 1 7 3 Z M12 3 V10 M12 10 H20" /><path d="M12 3 H17 A3 3 0 0 1 20 6 V10 H12 Z" fill="currentColor" /></svg>
          Right click
        </button>
        <button className={`pp-key ${grab ? 'is-lit' : ''}`} style={{ '--key': grab ? 'var(--yellow)' : 'var(--butter)', '--i': 1 } as React.CSSProperties} disabled={!enabled} onClick={() => { setG(grab ? '' : 'lock'); navigator.vibrate?.(15); if (!grab) echo('tap', 'Dragging · move to select') }} aria-pressed={!!grab}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M5 7 H19 M5 12 H11 M5 17 H9 M14 11 L20 17 L17 17.5 L18.6 21 L17 21.6 L15.5 18.2 L14 20 Z" /></svg>
          {grab ? 'Drop' : 'Select / drag'}
        </button>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- ask / pass cards */

function Arrow({ shot }: { shot: number }) {
  return (
    <span className="pp-go__arrow">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.svg key={shot} viewBox="0 0 24 24" initial={{ x: -22, y: 22, scale: 0.4 }} animate={{ x: 0, y: 0, scale: 1 }} exit={{ x: 26, y: -26, scale: 0.6, transition: { duration: 0.22, ease: [0.5, 0, 0.75, 0] } }} transition={{ ...POP, delay: 0.1 }} aria-hidden>
          <path d="M7 17 L17 7 M9 7 H17 V15" />
        </motion.svg>
      </AnimatePresence>
    </span>
  )
}

function Composer({ i, kind, title, sub, placeholder, label, bg, accent, linked, min, onSend, children }: {
  i: number; kind: string; title: string; sub: string; placeholder: string; label: string; bg: string; accent: string; linked: boolean; min: number; onSend: (v: string) => void; children?: React.ReactNode
}) {
  const [v, setV] = useState('')
  const [shot, setShot] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const ok = linked && v.trim().length >= min
  return (
    <Section i={i} title={title} className="pp-card" style={{ '--card': bg, '--accent': accent } as React.CSSProperties} meta={<span className="pp-card__glyph" style={{ background: accent }}><UseArt kind={kind} /></span>}>
      <div className="pp-card__body">
        <p className="pp-card__sub">{sub}</p>
        <form
          className="pp-compose"
          onSubmit={(e) => {
            e.preventDefault()
            if (!ok) return
            const text = v.trim()
            onSend(text)
            launch(input.current, accent, text.length > 26 ? `${text.slice(0, 24)}…` : text)
            setShot((n) => n + 1)
            setV('')
            navigator.vibrate?.(14)
          }}
        >
          <input ref={input} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} disabled={!linked} aria-label={label} />
          <motion.button type="submit" className="pp-go" disabled={!ok} aria-label={label} whileTap={{ scale: 0.86, rotate: -10 }}>
            <Arrow shot={shot} />
          </motion.button>
        </form>
        {children}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------------- buzz + unpair */

function Foot({ linked, peer, onUnpair }: { linked: boolean; peer: string; onUnpair: () => void }) {
  const [rang, setRang] = useState(0)
  return (
    <motion.footer className="pp-foot" initial={{ y: 60 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 20, delay: 0.55 }}>
      <button
        className="pp-buzz"
        disabled={!linked}
        onClick={() => {
          buzz()
          setRang((n) => n + 1)
          echo('ring', `Buzzed ${peer || 'the computer'}`)
        }}
      >
        {rang > 0 && [0, 1].map((k) => <motion.i key={`${rang}-${k}`} className="pp-buzz__ring" initial={{ scale: 0.9, borderWidth: 6 }} animate={{ scale: 1.5, borderWidth: 0 }} transition={{ duration: 0.7, delay: k * 0.14, ease: [0.22, 1, 0.36, 1] }} aria-hidden />)}
        <motion.svg key={rang} className="pp-buzz__bell" viewBox="0 0 24 24" animate={{ rotate: rang ? [0, -22, 18, -14, 10, -5, 0] : [0, -10, 8, 0, 0, 0] }} transition={rang ? { duration: 0.7 } : { duration: 1.6, repeat: Infinity, repeatDelay: 2.2 }} aria-hidden>
          <path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L20 18 H4 Z M10 21 H14" />
        </motion.svg>
        <span>Buzz {peer || 'the computer'}</span>
      </button>
      <button className="pp-cut" onClick={onUnpair}>
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M9 7 L7 5 A3.5 3.5 0 0 0 2 10 L4.5 12.5 M15 17 L17 19 A3.5 3.5 0 0 0 22 14 L19.5 11.5 M14 4 V6 M20 10 H18 M4 14 H6 M10 20 V18" />
        </svg>
        Unpair
      </button>
    </motion.footer>
  )
}

/* ---------------------------------------------------------------- ended */

/** After an unpair. The splash plays first, so this waits for it to clear before it opens. */
function Ended({ onAgain, after }: { onAgain: () => void; after: number }) {
  return (
    <div className="pr t-cream pp pp-end">
      <motion.div className="pp-end__card" initial={{ clipPath: 'inset(50% 0 50% 0 round 28px)' }} animate={{ clipPath: 'inset(0% 0 0% 0 round 28px)', transitionEnd: { clipPath: 'none' } }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: after }}>
        <div className="pp-end__duo" aria-hidden>
          {[-1, 1].map((side) => (
            <motion.span key={side} className="pp-end__dev" initial={{ x: side * 30, rotate: 0 }} animate={{ x: 0, rotate: side * 10 }} transition={{ type: 'spring', stiffness: 160, damping: 11, delay: after + 0.25 }}>
              <svg className="pp-end__cord" viewBox="-60 -10 120 80" style={{ [side < 0 ? 'left' : 'right']: '50%' }}>
                <motion.path
                  d={side < 0 ? 'M0 0 Q 22 6 24 40' : 'M0 0 Q -22 6 -24 40'}
                  animate={{ rotate: [side * 10, side * -8, side * 10] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ originX: '0px', originY: '0px' }}
                />
              </svg>
              <span className="pp-end__tile" style={{ background: side < 0 ? 'var(--butter)' : 'var(--peach)' }}>{side < 0 ? <ScreenGlyph size={30} /> : <PhoneGlyph size={30} />}</span>
            </motion.span>
          ))}
        </div>
        <Letters text="Unpaired" delay={after + 0.35} />
        <motion.p initial={{ y: 20, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} transition={{ ...SPRING, delay: after + 0.6 }}>
          Scan the code on your computer again, or pick the same trail back up here.
        </motion.p>
        <motion.button className="pp-again" onClick={onAgain} initial={{ y: 30, scale: 0.8 }} animate={{ y: 0, scale: 1 }} transition={{ ...POP, delay: after + 0.75 }}>
          Link again
        </motion.button>
      </motion.div>
    </div>
  )
}

/* ---------------------------------------------------------------- the page */

export function PhoneView({ code }: { code: string }) {
  const pair = usePair()
  const [ended, setEnded] = useState(false)
  useEffect(() => {
    joinAsPhone(code)
    document.documentElement.dataset.pairPhone = '1'
    return () => {
      delete document.documentElement.dataset.pairPhone
    }
  }, [code])
  useEffect(() => onPairEvent((e) => { if (e.kind === 'unpaired' && e.by === 'peer') setEnded(true) }), [])
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t === 'drop') {
          navigator.vibrate?.(30)
          chime('job')
        }
      }),
    [],
  )
  const linked = pair.status === 'linked'
  // a remote that dims and locks mid-use is no remote: hold the screen awake while linked, and take the lock
  // back when the page returns from the background (the browser drops it whenever the tab is hidden)
  useEffect(() => {
    if (!linked || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let gone = false
    const take = () => {
      if (document.visibilityState !== 'visible' || (lock && !lock.released)) return
      navigator.wakeLock.request('screen').then((l) => {
          if (gone) l.release()
          else lock = l
        }).catch(() => undefined)
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      gone = true
      document.removeEventListener('visibilitychange', take)
      lock?.release().catch(() => undefined)
    }
  }, [linked])
  const steer = linked && !pair.held
  const page = pagePath(pair.page || '')
  const incoming = pair.drops.filter((d) => d.from === 'host')
  const peer = pair.peer

  if (ended) return <Ended after={2.5} onAgain={() => { setEnded(false); joinAsPhone(code) }} />

  return (
    <div className={`pr t-cream pp ${linked ? 'is-linked' : 'is-down'}`}>
      <Tether status={pair.status === 'off' ? 'waiting' : pair.status} peer={peer} />
      <Keys linked={steer} page={page} />
      <Pad enabled={steer} peer={peer} held={pair.held && linked} />
      <div className="pp-cards">
        <Composer
          i={2}
          kind="ask"
          title="Ask"
          sub={`A question about the repository, answered on ${peer || 'the big screen'}.`}
          placeholder="How does retrying work?"
          label="Ask on the computer"
          bg="var(--lilac)"
          accent="var(--violet)"
          linked={steer}
          min={3}
          onSend={(q) => {
            post({ t: 'ask', q })
            echo('ask', `Asked “${q.length > 22 ? `${q.slice(0, 20)}…` : q}”`)
          }}
        />
        <Composer
          i={3}
          kind="drop"
          title="Pass across"
          sub="Text or a link, landing as a card over there. Anything sent back shows up here."
          placeholder="Text or a link"
          label="Send to the computer"
          bg="var(--peach)"
          accent="var(--orange)"
          linked={linked}
          min={1}
          onSend={(text) => {
            post({ t: 'drop', text })
            echo('drop', 'Passed it across')
          }}
        >
          <div className="pp-drops">
            <AnimatePresence initial={false}>
              {incoming.map((d) => (
                <motion.div key={d.id} layout className="pr-drop" initial={{ y: -60, scale: 0.6, rotate: -8 }} animate={{ y: 0, scale: 1, rotate: 0 }} exit={{ x: 260, rotate: 10, transition: { duration: 0.28, ease: [0.5, 0, 0.75, 0] } }} transition={{ type: 'spring', stiffness: 300, damping: 16 }}>
                  <span className="pr-drop__from"><ScreenGlyph size={13} /> {d.title ? d.title.replace(/ · Trailhead$/, '') : `From ${peer || 'your computer'}`}</span>
                  <p className={isLink(d.text) ? 'mono' : ''}>{d.text}</p>
                  <div className="pr-drop__acts">
                    <button onClick={() => navigator.clipboard?.writeText(d.text).then(() => notify.ok('Copied'), () => undefined)}>Copy</button>
                    {isLink(d.text) && <a href={d.text.trim()} target="_blank" rel="noreferrer noopener">Open ↗</a>}
                    {'share' in navigator && <button onClick={() => navigator.share({ text: d.text }).catch(() => undefined)}>Share</button>}
                    <button className="is-quiet" onClick={() => dismissDrop(d.id)}>Done</button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Composer>
      </div>
      <Foot linked={linked} peer={peer} onUnpair={() => { unpair(); setEnded(true) }} />
      <Flights />
    </div>
  )
}
