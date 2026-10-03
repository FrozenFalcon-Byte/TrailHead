import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import { animate, AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mark } from '../motion/Mark'
import { PhoneGlyph } from '../motion/PairHost'
import { buzz } from '../motion/PairSplash'
import { QrCode } from '../motion/QrSheet'
import {
  clearTraffic, dismissDrop, getPair, isLink, onPairMessage, PAIR_PAGES, pagePath, phoneUrl, post, prettyCode, startHosting, unpair, usePair, validCode, type Traffic,
} from '../lib/pair'
import { isLocalOrigin } from '../lib/qr'
import { notify } from '../lib/toast'
import { useSignedIn } from '../lib/auth'
import './pair.css'
import { EASE, FLIP_OUT, KIND_COLOR, KIND_LABEL, LinkLine, Since, SPRING, UseArt } from './pairParts'
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
  return isPhone() ? <JoinView /> : <HostView />
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

/** Something passed across rides the cord between the phone and the window. */
function Rider({ t, path }: { t: Traffic; path: React.RefObject<SVGPathElement | null> }) {
  const g = useRef<SVGGElement>(null)
  const p = useMotionValue(0)
  useEffect(() => {
    const el = path.current
    if (!el) return
    // the cord starts at the phone: what comes in from the phone runs forwards, what this screen sends runs back
    const place = (v: number) => {
      const at = el.getPointAtLength((t.dir === 'in' ? v : 1 - v) * el.getTotalLength())
      g.current?.setAttribute('transform', `translate(${at.x} ${at.y})`)
    }
    place(0)
    const ctl = animate(p, 1, { duration: 1.1, ease: [0.45, 0, 0.2, 1], onUpdate: place, onComplete: () => clearTraffic(t.id) })
    return () => ctl.stop()
  }, [t, path, p])
  const color = KIND_COLOR[t.kind] ?? 'var(--ink)'
  return (
    <g ref={g}>
      <motion.g initial={{ scale: 0 }} animate={{ scale: [0, 1.25, 1] }} transition={{ duration: 0.35 }}>
        <circle r={8} fill={color} stroke="var(--ink)" strokeWidth={2.5} />
        <text x={13} y={5} className="pr-rider__label">{KIND_LABEL[t.kind] ?? t.kind}</text>
      </motion.g>
    </g>
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

const REMOTE = [
  { kind: 'go', label: 'Steer' },
  { kind: 'tap', label: 'Point' },
  { kind: 'ask', label: 'Ask' },
  { kind: 'drop', label: 'Pass' },
] as const

/** The phone's screen once it is linked: the remote, lighting up whichever part was just used. */
function Remote({ lost, peer }: { lost: boolean; peer: string }) {
  const [lit, setLit] = useState('')
  useEffect(
    () =>
      onPairMessage((m) => {
        const kind = m.t === 'point' ? 'tap' : m.t
        if (!REMOTE.some((r) => r.kind === kind)) return
        setLit(kind)
        window.setTimeout(() => setLit((k) => (k === kind ? '' : k)), 600)
      }),
    [],
  )
  return (
    <motion.div className={`pr-remote ${lost ? 'is-lost' : ''}`} initial={{ clipPath: 'inset(100% 0 0 0)' }} animate={{ clipPath: 'inset(0% 0 0 0)', transitionEnd: { clipPath: 'none' } }} exit={{ clipPath: 'inset(0 0 100% 0)', transition: { duration: 0.35 } }} transition={{ duration: 0.55, ease: EASE, delay: 0.35 }}>
      <span className="pr-remote__top">{lost ? 'Out of reach' : peer || 'Linked'}</span>
      <div className="pr-remote__grid">
        {REMOTE.map((r, i) => (
          <motion.span key={r.kind} style={{ background: KIND_COLOR[r.kind] }} initial={{ scale: 0, rotate: -20 }} animate={{ scale: lit === r.kind ? 1.12 : 1, rotate: 0, y: lit === r.kind ? -4 : 0 }} transition={{ type: 'spring', stiffness: 420, damping: 14, delay: lit ? 0 : 0.55 + i * 0.06 }}>
            <UseArt kind={r.kind} />
            <b>{r.label}</b>
          </motion.span>
        ))}
      </div>
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

/** Keep the cord fastened to the top of the phone and the end of the window's bar, wherever the two have drifted,
 *  and let it sag (smoothly) while the phone is out of reach. */
function useCord(refs: { stage: React.RefObject<HTMLDivElement | null>; notch: React.RefObject<HTMLSpanElement | null>; bar: React.RefObject<HTMLDivElement | null>; svg: React.RefObject<SVGSVGElement | null>; paths: React.RefObject<SVGPathElement | null>[] }) {
  useEffect(() => {
    let raf = 0
    let sag = 0
    let size = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const st = refs.stage.current?.getBoundingClientRect()
      const no = refs.notch.current?.getBoundingClientRect()
      const bar = refs.bar.current?.getBoundingClientRect()
      if (!st || !no || !bar || !st.width) return
      const vb = `0 0 ${Math.round(st.width)} ${Math.round(st.height)}`
      if (vb !== size) refs.svg.current?.setAttribute('viewBox', (size = vb))
      sag += ((getPair().status === 'lost' ? 1 : 0) - sag) * 0.07
      const ax = no.left + no.width / 2 - st.left
      const ay = no.top - st.top - 12
      const bx = bar.right - st.left - 2
      const by = bar.top + bar.height / 2 - st.top
      const lift = 70 * (1 - sag)
      const drop = 150 * sag
      const d = `M${ax.toFixed(1)} ${ay.toFixed(1)} C ${ax.toFixed(1)} ${(ay - lift + drop).toFixed(1)}, ${(bx + 60).toFixed(1)} ${(by - lift * 0.6 + drop).toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`
      for (const p of refs.paths) p.current?.setAttribute('d', d)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [refs])
}

function Stage() {
  const pair = usePair()
  const cord = useRef<SVGPathElement>(null)
  const flow = useRef<SVGPathElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const notch = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const refs = useRef({ stage, notch, bar, svg, paths: [cord, flow] }).current
  useCord(refs)
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
        <motion.div className="pr-win" initial={{ y: 90, rotate: -3, scale: 0.94 }} animate={{ y: 0, rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 17, delay: 0.25 }}>
          <div className="pr-win__bar" ref={bar}>
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
                  <motion.div className="pr-qrbox" animate={{ rotate: [0, 0.8, 0, -0.8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                    <QrCode key={url} text={url} size={168} />
                  </motion.div>
                  <div className="pr-win__how">
                    <span>Scan with your phone’s camera</span>
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.b key={pair.code} className="mono" initial={{ y: 20, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -20, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>{prettyCode(pair.code)}</motion.b>
                    </AnimatePresence>
                    <small>or open /pair on the phone and type the code</small>
                  </div>
                </motion.div>
              ) : shown ? (
                <Mirror key="mirror" />
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>

      <svg className="pr-cord" ref={svg} aria-hidden>
        <motion.path
          ref={cord}
          d="M0 0"
          fill="none"
          stroke={lost ? 'var(--stop)' : 'var(--ink)'}
          strokeWidth={4}
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: shown ? 1 : 0 }}
          transition={{ pathLength: { duration: shown ? 0.8 : 0.3, ease: [0.65, 0, 0.35, 1], delay: shown ? 0.6 : 0 } }}
        />
        <path ref={flow} d="M0 0" className={`pr-cord__flow ${linked ? 'is-on' : ''}`} />
        {pair.traffic.map((t) => <Rider key={t.id} t={t} path={cord} />)}
      </svg>

      <motion.div className="pr-phone-at" style={{ x: phX, y: phY }}>
        <motion.div className="pr-phone" initial={{ x: 260, y: 240, rotate: 34 }} animate={{ x: 0, y: 0, rotate: shown ? -4 : -9 }} transition={{ type: 'spring', stiffness: 120, damping: 15, delay: 0.45 }}>
          <motion.div className="pr-phone__body" animate={shown ? { y: 0 } : { y: [0, -10, 0] }} transition={shown ? SPRING : { duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
            <span className="pr-phone__notch" ref={notch} />
            <div className="pr-phone__screen">
              <AnimatePresence initial={false}>
                {shown ? <Remote key="remote" lost={lost} peer={pair.peer} /> : <Viewfinder key="vf" />}
              </AnimatePresence>
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
    ? 'Your phone is a remote now. Steer, point, press, ask or pass something across; it all rides the cord.'
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
                  {linked ? <>Linked <Since at={pair.since} /></> : lost ? 'Out of reach, retrying' : <>Code <b className="mono">{pair.code ? prettyCode(pair.code) : '…'}</b></>}
                </span>
                <AnimatePresence mode="popLayout" initial={false}>
                  {shown ? (
                    <motion.span key="on" className="pr-acts__btns" initial={{ y: 20, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} exit={{ y: -20, clipPath: 'inset(100% 0 0 0)' }} transition={SPRING}>
                      <motion.button onClick={buzz} disabled={!linked} whileTap={{ scale: 0.92, rotate: -4 }}>Buzz {pair.peer || 'the phone'}</motion.button>
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

function JoinView() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return (
    <div className="pr t-cream pr-join">
      <Top quiet />
      <motion.div className="pr-join__card" initial={{ y: 40 }} animate={{ y: 0 }} transition={SPRING}>
        <span className="pr-kicker"><PhoneGlyph size={15} /> Pair a phone</span>
        <h1>Open this page on your computer, then scan its code.</h1>
        <p>Or type the eight letters it shows under the QR.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (validCode(clean)) navigate(`/pair#${clean}`) }}>
          <input value={clean.length > 4 ? `${clean.slice(0, 4)}·${clean.slice(4)}` : clean} onChange={(e) => setCode(e.target.value)} placeholder="ABCD·EFGH" aria-label="Pairing code" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="mono" />
          <button type="submit" disabled={!validCode(clean)}>Link</button>
        </form>
      </motion.div>
    </div>
  )
}

