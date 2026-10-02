import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import { animate, AnimatePresence, LayoutGroup, motion, useAnimationControls, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mark } from '../motion/Mark'
import { Cloud, Pine } from '../motion/Scenery'
import { PhoneGlyph } from '../motion/PairHost'
import { QrCode } from '../motion/QrSheet'
import {
  clearTraffic, dismissDrop, getPair, isLink, joinAsPhone, onPairMessage, PAIR_PAGES, pagePath, phoneUrl, post, prettyCode, startHosting, unpair, usePair, validCode, type Traffic,
} from '../lib/pair'
import { isLocalOrigin } from '../lib/qr'
import { chime, notify } from '../lib/toast'
import { useSignedIn } from '../lib/auth'
import './pair.css'

/* Pair a phone. On a computer the page shows a QR on a ridge; the phone that scans it opens this same page as a
   controller, and a trail draws itself across the valley between the two peaks. Everything that passes between
   them rides that trail. On a phone without a code, the page asks for the one the computer shows. */

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const
// The rope across the valley: taut while linked, sagging while the other side is out of reach.
const ROPE = {
  taut: 'M262 144 C 340 226, 420 258, 500 252 C 600 244, 680 206, 740 162',
  slack: 'M262 144 C 330 320, 430 362, 500 356 C 590 348, 690 292, 740 162',
}
const KIND_LABEL: Record<string, string> = { go: 'Steer', ask: 'Ask', drop: 'Pass', ring: 'Ring', tap: 'Point', bye: 'Bye' }
const KIND_COLOR: Record<string, string> = { go: 'var(--blue)', ask: 'var(--violet)', drop: 'var(--orange)', ring: 'var(--yellow)', tap: 'var(--green)', bye: 'var(--stop)' }

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

function LaptopGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={4} y={5} width={16} height={11} rx={1.8} />
      <path d="M2 19 H22" />
    </svg>
  )
}

/** Something passed across rides the rope from one peak to the other. */
function Rider({ t, path }: { t: Traffic; path: React.RefObject<SVGPathElement | null> }) {
  const g = useRef<SVGGElement>(null)
  const p = useMotionValue(0)
  useEffect(() => {
    const el = path.current
    if (!el) return
    const len = el.getTotalLength()
    const place = (v: number) => {
      const at = el.getPointAtLength((t.dir === 'out' ? v : 1 - v) * len)
      const ahead = el.getPointAtLength(Math.min(len, Math.max(0, (t.dir === 'out' ? v + 0.01 : 1 - v - 0.01) * len)))
      const tilt = (Math.atan2(ahead.y - at.y, ahead.x - at.x) * 180) / Math.PI
      g.current?.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${tilt * 0.35})`)
    }
    place(0)
    const ctl = animate(p, 1, { duration: 1.25, ease: [0.45, 0, 0.2, 1], onUpdate: place, onComplete: () => clearTraffic(t.id) })
    return () => ctl.stop()
  }, [t, path, p])
  const color = KIND_COLOR[t.kind] ?? 'var(--ink)'
  return (
    <g ref={g}>
      <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
        <path d="M0 0 V-26" stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <path d="M0 -26 H22 L16 -20 L22 -14 H0 Z" fill={color} stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
        <circle r={5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} />
        <text x={26} y={-15} className="pr-rider__label">{KIND_LABEL[t.kind] ?? t.kind}</text>
      </motion.g>
    </g>
  )
}

/** A flag planted on a peak; springs up when the link is made. */
function Flag({ x, y, up, color, delay = 0 }: { x: number; y: number; up: boolean; color: string; delay?: number }) {
  return (
    <motion.g initial={false} animate={{ scaleY: up ? 1 : 0 }} transition={{ type: 'spring', stiffness: 380, damping: 16, delay: up ? delay : 0 }} style={{ originX: `${x}px`, originY: `${y}px`, transformBox: 'view-box' }}>
      <path d={`M${x} ${y} V${y - 46}`} stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
      <motion.path d={`M${x} ${y - 46} H${x + 30} L${x + 22} ${y - 38} L${x + 30} ${y - 30} H${x} Z`} fill={color} stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" initial={false} animate={up ? { skewY: [0, -6, 3, 0] } : { skewY: 0 }} transition={{ duration: 1.4, repeat: up ? Infinity : 0, ease: 'easeInOut', delay: 0.6 }} style={{ originX: `${x}px`, transformBox: 'view-box' }} />
    </motion.g>
  )
}

/* ---------------------------------------------------------------- desktop */

/** A layer of the scene: rises into place on arrival, then drifts with the pointer by its depth. */
function Layer({ depth, px, py, delay, children }: { depth: number; px: MotionValue<number>; py: MotionValue<number>; delay: number; children: React.ReactNode }) {
  const x = useTransform(px, (v) => v * depth)
  const y = useTransform(py, (v) => v * depth * 0.4)
  return (
    <motion.g style={{ x, y }}>
      <motion.g initial={{ y: 160 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 17, delay }}>
        {children}
      </motion.g>
    </motion.g>
  )
}

/** Clouds loop: each one starts somewhere in the sky, then wraps around from the left edge. */
function Clouds() {
  return (
    <>
      {[
        { y: 40, s: 0.55, dur: 70, from: 120 },
        { y: 92, s: 0.4, dur: 54, from: 560 },
        { y: 20, s: 0.32, dur: 90, from: 860 },
      ].map((c, i) => (
        <motion.g key={i} animate={{ x: [c.from, 1100, -220, c.from] }} transition={{ duration: c.dur, ease: 'linear', repeat: Infinity, times: [0, (1100 - c.from) / 1320, (1100 - c.from) / 1320 + 0.0001, 1] }}>
          <Cloud x={0} y={c.y} s={c.s} />
        </motion.g>
      ))}
    </>
  )
}

/** Sparks thrown from a peak the moment the link is made. */
function Burst({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2
        const d = `M${Math.cos(a) * 14} ${Math.sin(a) * 14} L${Math.cos(a) * 44} ${Math.sin(a) * 44}`
        return <motion.path key={i} d={d} stroke={i % 2 ? color : 'var(--ink)'} strokeWidth={3.5} strokeLinecap="round" initial={{ pathLength: 0, pathOffset: 0 }} animate={{ pathLength: [0, 1, 0], pathOffset: [0, 0, 1] }} transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1], delay: 1.15 + (i % 3) * 0.03 }} />
      })}
    </g>
  )
}

function Scene({ status, peer, px, py }: { status: string; peer: string; px: MotionValue<number>; py: MotionValue<number> }) {
  const pair = usePair()
  const rope = useRef<SVGPathElement>(null)
  const linked = status === 'linked'
  const lost = status === 'lost'
  const drawn = linked || lost
  const [links, setLinks] = useState(0)
  const cam = useAnimationControls()
  const was = useRef(linked)
  useEffect(() => {
    if (linked && !was.current) {
      setLinks((n) => n + 1)
      void cam.start({ scale: [1, 1.04, 1], transition: { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.9 } })
    }
    was.current = linked
  }, [linked, cam])
  return (
    <motion.svg className="pr-scene" viewBox="0 0 1000 420" role="img" aria-label={linked ? `This computer and ${peer || 'your phone'} are linked` : 'Waiting for a phone'} animate={cam}>
      {/* sky: a turning sun and clouds that never stop crossing */}
      <motion.g style={{ x: useTransform(px, (v) => v * -4) }}>
        <motion.g initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 60, damping: 14, delay: 0.1 }}>
          <motion.g animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} style={{ originX: '520px', originY: '128px', transformBox: 'view-box' }}>
            {Array.from({ length: 12 }, (_, i) => (
              <rect key={i} x={517} y={70} width={6} height={16} rx={3} fill="var(--yellow)" transform={`rotate(${i * 30} 520 128)`} />
            ))}
          </motion.g>
          <circle cx={520} cy={128} r={34} fill="var(--yellow)" stroke="var(--ink)" strokeWidth={3} />
        </motion.g>
        <Clouds />
      </motion.g>

      <Layer depth={-8} px={px} py={py} delay={0.05}>
        <path d="M-40 420 V250 L120 196 L210 228 L330 150 L450 214 L560 170 L660 224 L790 138 L900 200 L1040 168 V420 Z" fill="var(--lilac)" />
      </Layer>
      <Layer depth={-16} px={px} py={py} delay={0.14}>
        <path d="M-40 420 V300 C 120 270, 200 290, 300 300 S 520 330, 640 300 S 860 260, 1040 290 V420 Z" fill="var(--mint)" />
      </Layer>

      <Layer depth={-26} px={px} py={py} delay={0.24}>
        {/* this computer's peak */}
        <path d="M40 430 L236 150 L330 250 L380 430 Z" fill="var(--butter)" stroke="var(--ink)" strokeWidth={3} strokeLinejoin="round" />
        <path d="M212 184 L236 150 L260 184 L247 177 L236 188 L224 177 Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" />
        {/* the phone's peak */}
        <path d="M600 430 L690 270 L766 168 L960 430 Z" fill="var(--peach)" stroke="var(--ink)" strokeWidth={3} strokeLinejoin="round" />
        <path d="M743 200 L766 168 L789 200 L777 193 L766 204 L755 193 Z" fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" />

        {/* the ghost of a trail while nobody is on the other side */}
        {!drawn && <motion.path d={ROPE.slack} fill="none" stroke="var(--ink-soft)" strokeWidth={3.5} strokeDasharray="0.5 13" strokeLinecap="round" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: -27 }} transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }} />}
        <defs>
          <mask id="pr-rope-mask" maskUnits="userSpaceOnUse" x={-100} y={-100} width={1200} height={700}>
            <motion.path d={ROPE.taut} fill="none" stroke="#fff" strokeWidth={16} strokeLinecap="round" initial={false} animate={{ pathLength: drawn ? 1 : 0, d: lost ? ROPE.slack : ROPE.taut }} transition={{ pathLength: { duration: drawn ? 1.2 : 0.35, ease: [0.65, 0, 0.35, 1], delay: drawn ? 0.15 : 0 }, d: { type: 'spring', stiffness: 120, damping: 9 } }} />
          </mask>
        </defs>
        <motion.path ref={rope} d={ROPE.taut} fill="none" stroke={lost ? 'var(--stop)' : 'var(--ink)'} strokeWidth={4} strokeDasharray="14 10" strokeLinecap="round" mask="url(#pr-rope-mask)" initial={false} animate={{ d: lost ? ROPE.slack : ROPE.taut, strokeDashoffset: linked ? [0, -48] : 0 }} transition={{ d: { type: 'spring', stiffness: 120, damping: 9 }, strokeDashoffset: { duration: 1.4, repeat: linked ? Infinity : 0, ease: 'linear' } }} />

        {/* camps: a ledge on each summit, the laptop on the left, the phone on the right once it arrives */}
        <g transform="translate(236 150)">
          <path d="M-44 -6 H44" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
          <motion.g initial={{ y: -90, rotate: -12 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.6 }}>
            <rect x={-27} y={-46} width={54} height={36} rx={7} fill="var(--solid)" />
            <motion.rect x={-21} y={-40} width={42} height={24} rx={3} fill="var(--lime)" animate={linked ? { fill: ['#c6f35e', '#dcf3e3', '#c6f35e'] } : { fill: '#c6f35e' }} transition={{ duration: 1.6, repeat: linked ? Infinity : 0 }} />
            <path d="M-36 -10 H36" stroke="var(--solid)" strokeWidth={6} strokeLinecap="round" />
          </motion.g>
          {/* calling out while it waits */}
          {!drawn &&
            [0, 1, 2].map((i) => (
              <motion.path key={i} d={`M${40 + i * 14} -52 Q${52 + i * 18} -30 ${40 + i * 14} -8`} fill="none" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" animate={{ pathLength: [0, 1, 1], pathOffset: [0, 0, 1] }} transition={{ duration: 1.6, repeat: Infinity, delay: 1 + i * 0.22, ease: 'easeInOut' }} />
            ))}
        </g>
        <g transform="translate(766 168)">
          <path d="M-36 -6 H36" stroke="var(--ink)" strokeWidth={5} strokeLinecap="round" />
          <AnimatePresence>
            {drawn && (
              <motion.g key="phone" initial={{ y: -120, rotate: 20, scale: 0.4 }} animate={{ y: 0, rotate: 0, scale: 1 }} exit={{ y: -60, scale: 0, rotate: -20 }} transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.3 }}>
                <rect x={-17} y={-66} width={34} height={58} rx={8} fill="var(--solid)" />
                <motion.rect x={-12} y={-59} width={24} height={40} rx={3} animate={{ fill: lost ? 'var(--dim)' : 'var(--sky)' }} />
                <circle cx={0} cy={-13} r={2.2} fill="var(--on-solid)" />
              </motion.g>
            )}
          </AnimatePresence>
        </g>
        <Flag x={262} y={186} up={linked} color="var(--orange)" delay={1.1} />
        <Flag x={790} y={202} up={linked} color="var(--violet)" delay={1.25} />
        {links > 0 && (
          <g key={`burst-${links}`}>
            <Burst x={236} y={120} color="var(--orange)" />
            <Burst x={766} y={130} color="var(--violet)" />
          </g>
        )}
        {pair.traffic.map((t) => (
          <Rider key={t.id} t={t} path={rope} />
        ))}
      </Layer>

      <Layer depth={-36} px={px} py={py} delay={0.34}>
        <path d="M-60 430 V380 C 160 360, 300 392, 500 384 S 840 366, 1060 384 V430 Z" fill="var(--paper)" stroke="var(--ink)" strokeWidth={3} />
        <Pine x={70} y={392} s={0.6} />
        <Pine x={96} y={396} s={0.45} />
        <Pine x={900} y={388} s={0.55} />
        <Pine x={930} y={392} s={0.4} />
      </Layer>
    </motion.svg>
  )
}

/** Each use shows itself working, small and on a loop. */
function UseArt({ kind }: { kind: string }) {
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  if (kind === 'go')
    return (
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <motion.path d="M5 12 H19 M13 6 L19 12 L13 18" {...stroke} animate={{ x: [-2, 3, -2] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
      </svg>
    )
  if (kind === 'tap')
    return (
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3 V7 M12 17 V21 M3 12 H7 M17 12 H21" {...stroke} />
        <motion.circle r={2.6} fill="currentColor" animate={{ cx: [12, 15, 10, 12], cy: [12, 10, 14, 12] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />
      </svg>
    )
  if (kind === 'ask')
    return (
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <path d="M5 6 H19 V16 H11 L7 20 V16 H5 Z" {...stroke} />
        {[0, 1, 2].map((i) => (
          <motion.circle key={i} cx={9 + i * 3} cy={11} r={1.2} fill="currentColor" animate={{ cy: [11, 9.4, 11] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
        ))}
      </svg>
    )
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
      <motion.path d="M4 12 L20 4 L14 20 L11 13 Z" {...stroke} animate={{ x: [-3, 2, -3], y: [3, -2, 3], rotate: [0, -6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
    </svg>
  )
}

const USES = [
  { kind: 'go', title: 'Steer', text: 'Tap a page on the phone and this screen goes there. Handy from across the room.' },
  { kind: 'tap', title: 'Point', text: 'Drag on the phone to move a laser dot over this screen while you walk someone through it.' },
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
              <motion.span key={String(on)} initial={{ y: 12, rotateX: -70 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -12, rotateX: 70 }} transition={SPRING}>
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

function Since({ at }: { at: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15000)
    return () => window.clearInterval(t)
  }, [])
  const m = Math.floor((Date.now() - at) / 60000)
  return <>{m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : 'over an hour ago'}</>
}

function HostView() {
  const pair = usePair()
  const [text, setText] = useState('')
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const px = useSpring(mx, { stiffness: 50, damping: 16 })
  const py = useSpring(my, { stiffness: 50, damping: 16 })
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
    ? 'Your phone is a remote now. Steer, point, ask or pass something across; it all rides the trail.'
    : lost
      ? 'It links again on its own as soon as the phone wakes or comes back into signal.'
      : 'Scan the code with your phone. It becomes a remote, a laser pointer and a pocket for links, for as long as both pages stay open.'

  return (
    <div className="pr t-cream">
      <Top />
      <LayoutGroup>
        <section className="pr-hero">
          <div className="pr-copy">
            <motion.span className="pr-kicker" initial={{ y: 24, rotate: -4 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}><PhoneGlyph size={15} live={linked} /> Pair a phone</motion.span>
            <Words text={head} />
            <motion.p layout="position" key={line} initial={{ y: 12 }} animate={{ y: 0 }} transition={SPRING}>{line}</motion.p>
            <motion.div layout className="pr-status" initial={{ y: 40, scale: 0.9 }} animate={{ y: 0, scale: 1 }} transition={{ ...SPRING, delay: 0.4 }}>
              {shown ? (
                <>
                  <span className={`pr-beacon ${linked ? 'is-on' : 'is-lost'}`} aria-hidden />
                  <span>{linked ? <>Linked <Since at={pair.since} /></> : 'Out of reach, retrying'}</span>
                  <button onClick={() => post({ t: 'ring' })} disabled={!linked}>Buzz the phone</button>
                  <button className="is-quiet" onClick={() => { unpair(); window.setTimeout(() => startHosting(true), 150) }}>Unpair</button>
                </>
              ) : (
                <>
                  <span className="pr-beacon" aria-hidden />
                  <span>Waiting for a phone · code <b className="mono">{pair.code ? prettyCode(pair.code) : '…'}</b></span>
                  <button className="is-quiet" onClick={() => startHosting(true)}>New code</button>
                </>
              )}
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
          </div>

          <motion.div
            className="pr-stage"
            initial={{ clipPath: 'inset(12% 12% 12% 12% round 120px)' }}
            animate={{ clipPath: 'inset(0% 0% 0% 0% round 28px)' }}
            transition={{ type: 'spring', stiffness: 90, damping: 18 }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              mx.set(((e.clientX - r.left) / r.width - 0.5) * 2)
              my.set(((e.clientY - r.top) / r.height - 0.5) * 2)
            }}
            onPointerLeave={() => { mx.set(0); my.set(0) }}
          >
            <Scene status={pair.status} peer={pair.peer} px={px} py={py} />
            <AnimatePresence>
              {!shown && pair.code && (
                <motion.div
                  key="qr"
                  className="pr-qr"
                  initial={{ y: -260, rotate: 14, rotateY: 70 }}
                  animate={{ y: 0, rotate: -2, rotateY: 0 }}
                  exit={{ x: 40, y: 150, scale: 0.12, rotate: 12, transition: { duration: 0.55, ease: [0.76, 0, 0.24, 1] } }}
                  transition={{ type: 'spring', stiffness: 160, damping: 15, delay: 0.75 }}
                >
                  <motion.div className="pr-qr__in" animate={{ y: [0, -5, 0], rotate: [0, 0.6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}>
                    <QrCode key={url} text={url} size={150} />
                    <span className="pr-qr__code mono">{prettyCode(pair.code)}</span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
            <Drops />
          </motion.div>
        </section>
      </LayoutGroup>
      <Uses />
      <p className="pr-fine">Nothing is stored: the two pages talk over a private channel named by the code, and the link ends when either one closes. The phone can only open Trailhead pages here; links it sends wait for you to click them.</p>
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

/** The cord between the two devices at the top of the phone: it flows while linked and sags when not. */
function Tether({ status, peer }: { status: string; peer: string }) {
  const linked = status === 'linked'
  return (
    <div className={`pp-tether is-${status}`}>
      <span className="pp-tether__end"><LaptopGlyph /></span>
      <svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden>
        <motion.path
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray="8 7"
          initial={false}
          animate={{ d: linked ? 'M4 20 C 60 20, 140 20, 196 20' : 'M4 20 C 60 44, 140 44, 196 20', strokeDashoffset: linked ? [0, 30] : 0 }}
          transition={{ d: { type: 'spring', stiffness: 140, damping: 10 }, strokeDashoffset: { duration: 1, repeat: linked ? Infinity : 0, ease: 'linear' } }}
        />
      </svg>
      <span className="pp-tether__end"><PhoneGlyph /></span>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.b key={status} initial={{ y: 14, rotateX: -60 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -14, rotateX: 60 }} transition={SPRING}>
          {linked ? `Linked to ${peer || 'your computer'}` : status === 'lost' ? 'Out of reach, retrying…' : status === 'off' ? 'Unpaired' : 'Reaching your computer…'}
        </motion.b>
      </AnimatePresence>
    </div>
  )
}

/** One-finger drag moves the laser dot; a quick tap rings where it points; the rail on the right scrolls the page. */
function Pad({ enabled }: { enabled: boolean }) {
  const acc = useRef({ dx: 0, dy: 0, sy: 0 })
  const start = useRef<{ x: number; y: number; t: number; moved: number } | null>(null)
  const last = useRef({ x: 0, y: 0 })
  const dot = useRef<HTMLSpanElement>(null)
  const [mode, setMode] = useState<'' | 'point' | 'scroll'>('')
  useEffect(() => {
    const t = window.setInterval(() => {
      const a = acc.current
      if (a.dx || a.dy) post({ t: 'point', dx: Math.round(a.dx), dy: Math.round(a.dy) })
      if (a.sy) post({ t: 'scroll', dy: Math.round(a.sy) })
      acc.current = { dx: 0, dy: 0, sy: 0 }
    }, 60)
    return () => window.clearInterval(t)
  }, [])
  const down = (kind: 'point' | 'scroll') => (e: React.PointerEvent) => {
    if (!enabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), moved: 0 }
    last.current = { x: e.clientX, y: e.clientY }
    setMode(kind)
  }
  const move = (e: React.PointerEvent) => {
    if (!start.current || !mode) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    start.current.moved += Math.abs(dx) + Math.abs(dy)
    if (mode === 'point') {
      acc.current.dx += dx
      acc.current.dy += dy
      const r = e.currentTarget.getBoundingClientRect()
      dot.current?.style.setProperty('translate', `${e.clientX - r.left}px ${e.clientY - r.top}px`)
    } else acc.current.sy -= dy * 1.6
  }
  const up = () => {
    const s = start.current
    if (s && mode === 'point' && s.moved < 8 && Date.now() - s.t < 260) {
      post({ t: 'tap' })
      navigator.vibrate?.(12)
    }
    start.current = null
    setMode('')
  }
  return (
    <div className={`pp-pad ${enabled ? '' : 'is-off'}`}>
      <div className={`pp-pad__area ${mode === 'point' ? 'is-on' : ''}`} onPointerDown={down('point')} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span ref={dot} className="pp-pad__dot" aria-hidden />
        <span className="pp-pad__hint">Drag to point · tap to ring the spot</span>
      </div>
      <div className={`pp-pad__rail ${mode === 'scroll' ? 'is-on' : ''}`} onPointerDown={down('scroll')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Scroll the page">
        {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
        <span>Scroll</span>
      </div>
    </div>
  )
}

function PhoneView({ code }: { code: string }) {
  const pair = usePair()
  const [q, setQ] = useState('')
  const [text, setText] = useState('')
  const [ended, setEnded] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    joinAsPhone(code)
    document.documentElement.dataset.pairPhone = '1'
    return () => {
      delete document.documentElement.dataset.pairPhone
    }
  }, [code])
  useEffect(
    () =>
      onPairMessage((m) => {
        if (m.t === 'ring') {
          navigator.vibrate?.([40, 60, 80])
          chime('info')
          root.current?.animate([{ translate: '0 0' }, { translate: '-8px 0' }, { translate: '8px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' })
        }
        if (m.t === 'drop') {
          navigator.vibrate?.(30)
          chime('job')
        }
      }),
    [],
  )
  const linked = pair.status === 'linked'
  const page = pagePath(pair.page || '')
  const incoming = pair.drops.filter((d) => d.from === 'host')

  if (ended)
    return (
      <div className="pr t-cream pp">
        <Tether status="off" peer="" />
        <motion.div className="pp-ended" initial={{ y: 30 }} animate={{ y: 0 }} transition={SPRING}>
          <h1>Unpaired.</h1>
          <p>Scan the code on your computer again to pick the trail back up.</p>
          <button onClick={() => { setEnded(false); joinAsPhone(code) }}>Link again</button>
        </motion.div>
      </div>
    )

  return (
    <div className="pr t-cream pp" ref={root}>
      <Tether status={pair.status === 'off' ? 'waiting' : pair.status} peer={pair.peer} />

      <section className="pp-block">
        <h2>Steer</h2>
        <div className="pp-pages">
          {PAIR_PAGES.map((p) => {
            const on = page === p.to
            return (
              <motion.button key={p.to} className={on ? 'is-on' : ''} disabled={!linked} onClick={() => { post({ t: 'go', to: p.to }); navigator.vibrate?.(10) }} whileTap={{ scale: 0.92 }}>
                {on && <motion.span layoutId="pp-here" className="pp-pages__here" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={p.glyph} /></svg>
                <span>{p.label}</span>
              </motion.button>
            )
          })}
        </div>
      </section>

      <section className="pp-block">
        <h2>Point and scroll</h2>
        <Pad enabled={linked} />
      </section>

      <section className="pp-block">
        <h2>Ask on the big screen</h2>
        <form className="pp-form" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 3) { post({ t: 'ask', q: q.trim() }); setQ(''); notify.ok('Asked on your computer', 'The answer opens there.') } }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="How does retrying work?" disabled={!linked} aria-label="Question" />
          <button type="submit" disabled={!linked || q.trim().length < 3}>Ask</button>
        </form>
      </section>

      <section className="pp-block">
        <h2>Pass across</h2>
        <form className="pp-form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { post({ t: 'drop', text: text.trim() }); setText('') } }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text or a link" disabled={!linked} aria-label="Send to computer" />
          <button type="submit" disabled={!linked || !text.trim()}>Send</button>
        </form>
        <div className="pp-drops">
          <AnimatePresence initial={false}>
            {incoming.map((d) => (
              <motion.div key={d.id} layout className="pr-drop" initial={{ y: -40, scale: 0.9, rotate: -3 }} animate={{ y: 0, scale: 1, rotate: 0 }} exit={{ x: 200, rotate: 6, transition: { duration: 0.25 } }} transition={SPRING}>
                <span className="pr-drop__from"><LaptopGlyph size={13} /> {d.title ? d.title.replace(/ · Trailhead$/, '') : 'From your computer'}</span>
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
      </section>

      <footer className="pp-foot">
        <motion.button className="pp-ring" disabled={!linked} onClick={() => post({ t: 'ring' })} whileTap={{ scale: 0.9, rotate: -8 }}>
          Ring the computer
        </motion.button>
        <button className="is-quiet" onClick={() => { unpair(); setEnded(true) }}>Unpair</button>
      </footer>
    </div>
  )
}
