import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Mark } from '../motion/Mark'
import { PhoneGlyph } from '../motion/PairHost'
import { JoinView } from './PairJoin'
import { buzz } from '../motion/PairSplash'
import { QrCode } from '../motion/QrSheet'
import {
  dismissDrop, getPair, holdRemote, isLink, onPairMessage, PAIR_PAGES, pagePath, phoneUrl, post, prettyCode, startHosting, unpair, usePair, validCode,
} from '../lib/pair'
import { isLocalOrigin } from '../lib/qr'
import { notify } from '../lib/toast'
import { useSignedIn } from '../lib/auth'
import './pair.css'
import { EASE, FLIP_OUT, KIND_COLOR, LinkLine, Since, SPRING, UseArt } from './pairParts'
import { Island, MiniRemote, StageHop, StatusBar } from './PairDevice'
import { PhoneView } from './PairPhone'

/* Pair a phone. On a computer the page shows a QR on a ridge; the phone that scans it opens this same page as a
   controller, and a trail draws itself across the valley between the two peaks. Everything that passes between
   them rides that trail. On a phone without a code, the page asks for the one the computer shows. */

const isPhone = () => window.matchMedia('(max-width: 720px), (pointer: coarse) and (max-width: 1024px)').matches

export default function Pair() {
  const location = useLocation()
  const code = location.hash.slice(1).toUpperCase()
  useEffect(() => {
    const title = document.title
    document.title = 'Pair a phone · Trailhead'
    return () => {
      document.title = title
    }
  }, [])
  if (validCode(code)) return <PhoneView code={code} />
  return isPhone() || new URLSearchParams(location.search).has('join') ? <JoinView /> : <HostView />
}

/* ---------------------------------------------------------------- shared bits */

function Top({ quiet = false }: { quiet?: boolean }) {
  const signedIn = useSignedIn()
  return (
    <header className="pr-top">
      <Link to="/" className="pr-top__brand" aria-label="Trailhead home">
        <Mark size={32} />
        <b>Trailhead</b>
      </Link>
      {!quiet && (
        <nav>
          <Link to="/">Home</Link>
          <Link to="/guide">Guide</Link>
          <Link to={signedIn ? '/app' : '/login'} className="pr-top__cta">{signedIn ? 'Dashboard' : 'Log in'}</Link>
        </nav>
      )}
    </header>
  )
}

/* ---------------------------------------------------------------- desktop */

/** Low layered hills behind everything, each drifting with the pointer by its depth. */
function Hills({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const layers = [
    { d: 'M-40 700 V470 L90 420 L190 452 L310 380 L430 440 L540 400 L650 450 L780 372 L890 430 L1040 398 V700 Z', fill: 'var(--lilac)', depth: -6, delay: 0.1 },
    { d: 'M-40 700 V540 C 120 506, 230 530, 340 540 S 560 566, 690 534 S 900 500, 1040 526 V700 Z', fill: 'var(--mint)', depth: -12, delay: 0.18 },
    { d: 'M-60 700 V626 C 160 606, 320 636, 520 628 S 860 610, 1060 628 V700 Z', fill: 'var(--paper)', depth: -20, delay: 0.26, stroke: true },
  ]
  return (
    <svg className="pr-hills" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden>
      {layers.map((l, i) => (
        <HillLayer key={i} {...l} px={px} py={py} />
      ))}
    </svg>
  )
}
function HillLayer({ d, fill, depth, delay, stroke, px, py }: { d: string; fill: string; depth: number; delay: number; stroke?: boolean; px: MotionValue<number>; py: MotionValue<number> }) {
  const x = useTransform(px, (v) => v * depth)
  const y = useTransform(py, (v) => v * depth * 0.3)
  return (
    <motion.g style={{ x, y }}>
      <motion.path d={d} fill={fill} stroke={stroke ? 'var(--ink)' : 'none'} strokeWidth={3} vectorEffect="non-scaling-stroke" initial={{ y: 200 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 110, damping: 17, delay }} />
    </motion.g>
  )
}

/** The phone's screen while nobody has scanned: a camera viewfinder that keeps hunting. */
function Viewfinder() {
  return (
    <motion.div className="pr-vf" initial={{ clipPath: 'inset(0 0 100% 0)' }} animate={{ clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} exit={{ clipPath: 'inset(100% 0 0 0)', transition: { duration: 0.4, ease: [0.76, 0, 0.24, 1] } }} transition={{ duration: 0.5, ease: EASE }}>
      <motion.div className="pr-vf__frame" animate={{ scale: [1, 0.86, 1] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}>
        {['tl', 'tr', 'bl', 'br'].map((c) => <i key={c} className={`pr-vf__c is-${c}`} />)}
        <motion.span className="pr-vf__scan" animate={{ y: ['-40%', '140%'] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', repeatType: 'reverse' }} />
      </motion.div>
      <span className="pr-vf__label">Point at the code</span>
    </motion.div>
  )
}

type Move = { id: number; kind: string; text: string }
const pageLabel = (p: string) => PAIR_PAGES.find((x) => x.to === pagePath(p))?.label ?? 'Pair a phone'

/** The window once the phone is linked: which page the phone has this screen on, and what it just did. */
function Mirror() {
  const pair = usePair()
  const [moves, setMoves] = useState<Move[]>([])
  useEffect(
    () =>
      onPairMessage((m) => {
        const text =
          m.t === 'go' ? `Steered to ${pageLabel(m.to)}` : m.t === 'ask' ? `Asked “${m.q.slice(0, 60)}”` : m.t === 'drop' ? `Passed “${m.text.slice(0, 60)}”` : m.t === 'ring' ? 'Buzzed this screen' : m.t === 'tap' ? 'Pressed with its cursor' : ''
        if (text) setMoves((all) => [{ id: Date.now() + Math.random(), kind: m.t, text }, ...all].slice(0, 4))
      }),
    [],
  )
  return (
    <motion.div className="pr-mirror" initial={{ y: 40, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} exit={{ y: -20, clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.3 } }} transition={{ type: 'spring', stiffness: 200, damping: 24, delay: 0.5 }}>
      <span className="pr-mirror__k"><PhoneGlyph size={14} live /> {pair.peer || 'Your phone'} has the wheel</span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.b key={pair.page} className="pr-mirror__page" initial={{ y: 30, rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -30, rotateX: 70, transition: FLIP_OUT }} transition={SPRING}>
          {pageLabel(pair.page)}
        </motion.b>
      </AnimatePresence>
      <ol className="pr-mirror__log">
        <AnimatePresence initial={false}>
          {moves.length === 0 && (
            <motion.li key="empty" className="is-empty" exit={{ x: -30, transition: { duration: 0.2 } }}>
              Tap a page, drag to point, or ask something on the phone.
            </motion.li>
          )}
          {moves.map((mv) => (
            <motion.li key={mv.id} layout initial={{ x: 60, rotate: 2 }} animate={{ x: 0, rotate: 0 }} exit={{ x: -40, transition: { duration: 0.2 } }} transition={SPRING}>
              <i style={{ background: KIND_COLOR[mv.kind] ?? 'var(--ink)' }} />
              {mv.text}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  )
}

/** The QR, which swells to fill the window while the pointer is on it (or a tap holds it), so a phone across the room
 *  can still read it. */
function QrHold({ url }: { url: string }) {
  const [big, setBig] = useState(false)
  return (
    <motion.div
      className={`pr-qrhold ${big ? 'is-big' : ''}`}
      onHoverStart={() => setBig(true)}
      onHoverEnd={() => setBig(false)}
      onTap={(e) => { if ((e as PointerEvent).pointerType !== 'mouse') setBig((b) => !b) }}
      animate={{ scale: big ? 1.8 : 1, rotate: big ? -1.5 : 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, mass: 0.8 }}
    >
      <motion.div className="pr-qrbox" animate={big ? { rotate: 0 } : { rotate: [0, 0.8, 0, -0.8, 0] }} transition={big ? SPRING : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
        <QrCode key={url} text={url} size={168} />
      </motion.div>
    </motion.div>
  )
}

/** Copy the pairing link, for sending to the phone some other way (a message to yourself, AirDrop). */
function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(0)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(0), 1600)
    return () => window.clearTimeout(t)
  }, [done])
  return (
    <motion.button className="pr-copy-link" whileTap={{ scale: 0.92 }} onClick={() => navigator.clipboard?.writeText(url).then(() => setDone(Date.now()), () => notify.warn('Could not copy', url))}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={done ? 'y' : 'n'} initial={{ y: 14, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -14, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>
          {done ? 'Link copied ✓' : 'Copy the link'}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

/** The window holding the QR and the iPhone in front of it; whatever passes across hops between the island and the window. */
function Stage() {
  const pair = usePair()
  const stage = useRef<HTMLDivElement>(null)
  const island = useRef<HTMLDivElement>(null)
  const win = useRef<HTMLDivElement>(null)
  const linked = pair.status === 'linked'
  const lost = pair.status === 'lost'
  const shown = linked || lost
  const url = pair.code ? phoneUrl(pair.code) : ''
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const px = useSpring(mx, { stiffness: 50, damping: 16 })
  const py = useSpring(my, { stiffness: 50, damping: 16 })
  const winX = useTransform(px, (v) => v * -6)
  const winY = useTransform(py, (v) => v * -4)
  const phX = useTransform(px, (v) => v * 12)
  const phY = useTransform(py, (v) => v * 8)
  return (
    <motion.div
      ref={stage}
      className="pr-stage"
      initial={{ clipPath: 'inset(10% 10% 10% 10% round 120px)' }}
      animate={{ clipPath: 'inset(0% 0% 0% 0% round 28px)' }}
      transition={{ type: 'spring', stiffness: 90, damping: 18 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        mx.set(((e.clientX - r.left) / r.width - 0.5) * 2)
        my.set(((e.clientY - r.top) / r.height - 0.5) * 2)
      }}
      onPointerLeave={() => { mx.set(0); my.set(0) }}
      role="img"
      aria-label={linked ? `This computer and ${pair.peer || 'your phone'} are linked` : 'Waiting for a phone to scan the code'}
    >
      <Hills px={px} py={py} />

      <motion.div className="pr-win-at" style={{ x: winX, y: winY }}>
        <motion.div className="pr-win" ref={win} initial={{ y: 90, rotate: -3, scale: 0.94 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 17, delay: 0.25 }}>
          <div className="pr-win__bar">
            <i /><i /><i />
            <span className="mono">trailhead · pair</span>
          </div>
          <div className="pr-win__body">
            <AnimatePresence mode="wait" initial={false}>
              {!shown && pair.code ? (
                <motion.div
                  key="qr"
                  className="pr-win__qr"
                  initial={{ y: 30, clipPath: 'inset(0 0 100% 0)' }}
                  animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }}
                  exit={{ x: 220, y: 120, scale: 0.25, rotate: 14, transition: { duration: 0.5, ease: [0.76, 0, 0.24, 1] } }}
                  transition={{ type: 'spring', stiffness: 170, damping: 22, delay: 0.6 }}
                >
                  <QrHold url={url} />
                  <div className="pr-win__how">
                    <span>Scan with your phone’s camera</span>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.b key={pair.code} className="mono" initial={{ y: 20, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -20, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>{prettyCode(pair.code)}</motion.b>
                    </AnimatePresence>
                    <small>or open /pair on the phone and type the code</small>
                    <CopyLink url={url} />
                  </div>
                </motion.div>
              ) : shown ? (
                <Mirror key="mirror" />
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>


      {pair.traffic.map((t) => <StageHop key={t.id} t={t} stage={stage} island={island} win={win} />)}

      <motion.div className="pr-phone-at" style={{ x: phX, y: phY }}>
        <motion.div className="pr-phone" initial={{ x: 260, y: 240, rotate: 34 }} animate={{ x: 0, y: 0, rotate: shown ? -4 : -9 }} transition={{ type: 'spring', stiffness: 120, damping: 15, delay: 0.45 }}>
          <motion.div className={`pr-phone__body ${lost ? 'is-lost' : ''}`} animate={shown ? { y: 0 } : { y: [0, -10, 0] }} transition={shown ? SPRING : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <i className="pr-phone__btn is-action" />
            <i className="pr-phone__btn is-up" />
            <i className="pr-phone__btn is-down" />
            <i className="pr-phone__btn is-side" />
            <div className="pr-phone__screen">
              <AnimatePresence initial={false}>
                {shown ? <MiniRemote key="remote" lost={lost} peer={pair.peer} /> : <Viewfinder key="vf" />}
              </AnimatePresence>
              <StatusBar lost={lost} />
              <Island ref={island} lost={lost} waiting={!shown} />
              <i className="pr-phone__home" />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

/** Each use shows itself working, small and on a loop. */
const USES = [
  { kind: 'go', title: 'Steer', text: 'Tap a page on the phone and this screen goes there. Handy from across the room.' },
  { kind: 'tap', title: 'Point', text: 'Drag on the phone to move a cursor with its name on it over this screen; tap to press what it points at.' },
  { kind: 'ask', title: 'Ask', text: 'Type a question on the phone and it is answered here, on the big screen, with the code behind it.' },
  { kind: 'drop', title: 'Pass across', text: 'Send text and links either way. They land as cards; nothing opens by itself.' },
] as const

function Uses() {
  const pair = usePair()
  const [lit, setLit] = useState('')
  useEffect(
    () =>
      onPairMessage((m) => {
        const kind = m.t === 'point' ? 'tap' : m.t
        if (USES.some((u) => u.kind === kind)) {
          setLit(kind)
          window.setTimeout(() => setLit((k) => (k === kind ? '' : k)), 900)
        }
      }),
    [],
  )
  const on = pair.status === 'linked'
  return (
    <section className="pr-uses" aria-label="What the phone can do">
      {USES.map((u, i) => (
        <motion.article
          key={u.kind}
          className={`pr-use ${lit === u.kind ? 'is-lit' : ''}`}
          initial={{ y: 70, rotate: i % 2 ? 3 : -3 }}
          animate={lit === u.kind ? { y: [0, -10, 0], rotate: [0, i % 2 ? 2 : -2, 0] } : { y: 0, rotate: 0 }}
          transition={lit === u.kind ? { duration: 0.55, ease: EASE } : { type: 'spring', stiffness: 170, damping: 18, delay: 0.5 + i * 0.07 }}
          whileHover={{ y: -6, rotate: i % 2 ? 0.8 : -0.8, transition: { type: 'spring', stiffness: 300, damping: 18 } }}
        >
          <span className="pr-use__glyph" style={{ background: KIND_COLOR[u.kind] }}>
            <UseArt kind={u.kind} />
          </span>
          <h3>{u.title}</h3>
          <p>{u.text}</p>
          <span className={`pr-use__state ${on ? 'is-on' : ''}`}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={String(on)} initial={{ y: 12, rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -12, rotateX: 70, transition: FLIP_OUT }} transition={SPRING}>
                {on ? 'Ready on your phone' : 'After you scan'}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.article>
      ))}
    </section>
  )
}

/** A headline whose words flip up one after another, again whenever it changes. */
function Words({ text }: { text: string }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.h1 key={text} exit={{ y: -30, rotateX: 40, transition: { duration: 0.2 } }}>
        {text.split(' ').map((w, i) => (
          <motion.span key={i} className="pr-word" initial={{ y: '0.9em', rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 20, delay: 0.08 + i * 0.07 }}>
            {w}{' '}
          </motion.span>
        ))}
      </motion.h1>
    </AnimatePresence>
  )
}

function Drops() {
  const pair = usePair()
  const incoming = pair.drops.filter((d) => d.from === 'phone')
  return (
    <div className="pr-drops">
      <AnimatePresence initial={false}>
        {incoming.map((d) => (
          <motion.div key={d.id} layout className="pr-drop" initial={{ x: 120, rotate: 5, scale: 0.9 }} animate={{ x: 0, rotate: 0, scale: 1 }} exit={{ x: 160, rotate: 4, scale: 0.9, transition: { duration: 0.28, ease: [0.76, 0, 0.24, 1] } }} transition={SPRING}>
            <span className="pr-drop__from"><PhoneGlyph size={13} /> From {pair.peer || 'your phone'}</span>
            <p className={isLink(d.text) ? 'mono' : ''}>{d.text}</p>
            <div className="pr-drop__acts">
              <button onClick={() => navigator.clipboard?.writeText(d.text).then(() => notify.ok('Copied', 'From your phone'), () => undefined)}>Copy</button>
              {isLink(d.text) && <a href={d.text.trim()} target="_blank" rel="noreferrer noopener">Open ↗</a>}
              <button className="is-quiet" onClick={() => dismissDrop(d.id)}>Done</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

function HostView() {
  const pair = usePair()
  const [text, setText] = useState('')
  useEffect(() => {
    if (getPair().role !== 'phone') startHosting()
    return () => {
      // leaving before any phone joined: stop listening; a live link carries on across the app
      if (getPair().role === 'host' && getPair().status === 'waiting') unpair()
    }
  }, [])
  const url = pair.code ? phoneUrl(pair.code) : ''
  const local = url ? isLocalOrigin(url) : false
  const linked = pair.status === 'linked'
  const lost = pair.status === 'lost'
  const shown = linked || lost
  const send = (e: React.FormEvent) => {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    post({ t: 'drop', text: t })
    setText('')
  }
  const head = linked ? `Linked to ${pair.peer || 'your phone'}.` : lost ? 'The phone stepped away.' : 'Two screens, one trail.'
  const line = linked
    ? 'Your phone is a remote now. Steer, point, press, ask or pass something across, and watch it hop between the two.'
    : lost
      ? 'It links again on its own as soon as the phone wakes or comes back into signal.'
      : 'Scan the code with your phone. It becomes a remote with its own cursor here, and a pocket for links, for as long as both pages stay open.'

  return (
    <div className="pr t-cream">
      <Top />
      <LayoutGroup>
        <section className="pr-hero">
          <div className="pr-copy">
            <motion.span className="pr-kicker" initial={{ y: 24, rotate: -4 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}><PhoneGlyph size={15} live={linked} /> Pair a phone</motion.span>
            <Words text={head} />
            <motion.p layout="position" key={line} initial={{ y: 12 }} animate={{ y: 0 }} transition={SPRING}>{line}</motion.p>
            <motion.div layout initial={{ y: 40 }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.4 }}>
              <LinkLine status={pair.status} peer={pair.peer} />
              <div className="pr-acts">
                <span className="pr-acts__state">
                  {linked ? <>{pair.held ? 'Paused · ' : ''}Linked <Since at={pair.since} /></> : lost ? 'Out of reach, retrying' : <>Code <b className="mono">{pair.code ? prettyCode(pair.code) : '…'}</b></>}
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  {shown ? (
                    <motion.span key="on" className="pr-acts__btns" initial={{ y: 20, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} exit={{ y: -20, clipPath: 'inset(100% 0 0 0)' }} transition={SPRING}>
                      <motion.button onClick={buzz} disabled={!linked} whileTap={{ scale: 0.92, rotate: -4 }}>Buzz {pair.peer || 'the phone'}</motion.button>
                      <motion.button className={pair.held ? 'is-held' : 'is-quiet'} onClick={() => holdRemote(!pair.held)} disabled={!linked} whileTap={{ scale: 0.92 }} data-cursor={pair.held ? 'Give the phone its controls back' : 'Stop the phone steering this screen'}>{pair.held ? 'Resume remote' : 'Pause remote'}</motion.button>
                      <button className="is-quiet" onClick={() => { unpair(); window.setTimeout(() => startHosting(true), 150) }}>Unpair</button>
                    </motion.span>
                  ) : (
                    <motion.span key="off" className="pr-acts__btns" initial={{ y: 20, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} exit={{ y: -20, clipPath: 'inset(100% 0 0 0)' }} transition={SPRING}>
                      <button className="is-quiet" onClick={() => startHosting(true)}>New code</button>
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
            {local && !shown && <p className="pr-warn">This code points at <b>localhost</b>, which a phone cannot open. Set an address it can reach in <Link to="/app/settings#sharing">Settings → Sharing</Link>, or try it with a second tab here.</p>}
            <AnimatePresence initial={false}>
              {linked && (
                <motion.form key="send" className="pr-send" onSubmit={send} initial={{ height: 0, y: -10 }} animate={{ height: 'auto', y: 0 }} exit={{ height: 0, y: -10 }} transition={SPRING}>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Send text or a link to the phone" aria-label="Send to phone" />
                  <button type="submit" disabled={!text.trim()}>Send ↗</button>
                </motion.form>
              )}
            </AnimatePresence>
            <Drops />
          </div>
          <Stage />
        </section>
      </LayoutGroup>
      <Uses />
      <p className="pr-fine">Nothing is stored: the two pages talk over a private channel named by the code, and the link ends when either one unpairs. The phone can only open Trailhead pages here; links it sends wait for you to click them.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- phone */


