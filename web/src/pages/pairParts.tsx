import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { PhoneGlyph } from '../motion/PairHost'
import { ScreenGlyph } from '../motion/PairSplash'
import { clearTraffic, deviceName, usePair, type Traffic } from '../lib/pair'

/* Pieces both halves of the pairing page share: the link line between the two devices, the relative clock, and the
   small animated glyphs for each thing a phone can do. */

export const EASE = [0.22, 1, 0.36, 1] as const
export const SPRING = { type: 'spring', stiffness: 260, damping: 28 } as const
/** Flipped-out words leave on a short clock, so the old word is never still turning when the new one lands. */
export const FLIP_OUT = { duration: 0.22, ease: [0.5, 0, 0.75, 0] } as const
export const KIND_LABEL: Record<string, string> = { go: 'Steer', ask: 'Ask', drop: 'Pass', ring: 'Ring', tap: 'Point', bye: 'Bye' }
export const KIND_COLOR: Record<string, string> = { go: 'var(--blue)', ask: 'var(--violet)', drop: 'var(--orange)', ring: 'var(--yellow)', tap: 'var(--green)', bye: 'var(--stop)' }

export function UseArt({ kind }: { kind: string }) {
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

export function Since({ at }: { at: number }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 15000)
    return () => window.clearInterval(t)
  }, [])
  const m = Math.floor((Date.now() - at) / 60000)
  return <>{m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : 'over an hour ago'}</>
}

/** The two devices side by side with the line between them: it flows while linked, sags red while the phone is out
 *  of reach, and marches as dots while it waits. */
export function LinkLine({ status, peer, phone = false, bare = false }: { status: string; peer: string; phone?: boolean; bare?: boolean }) {
  const linked = status === 'linked'
  const lost = status === 'lost'
  const pair = usePair()
  const line = useRef<SVGPathElement>(null)
  const me = deviceName()
  const devices = [
    { key: 'screen', name: phone ? peer || 'Computer' : me, glyph: <ScreenGlyph size={22} />, bg: 'var(--butter)', you: !phone },
    { key: 'phone', name: phone ? me : peer || 'Your phone', glyph: <PhoneGlyph size={22} live={linked} />, bg: 'var(--peach)', you: phone },
  ]
  return (
    <div className={`pr-link is-${status}`}>
      {devices.map((d, i) => (
        <motion.span key={d.key} className={`pr-link__dev ${i ? 'is-right' : ''}`} animate={{ x: linked ? (i ? -4 : 4) : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
          <motion.span className="pr-link__tile" style={{ background: d.bg }} animate={!linked && !lost && !d.you ? { scale: [1, 0.9, 1] } : { scale: 1 }} transition={{ duration: 1.4, repeat: !linked && !lost && !d.you ? Infinity : 0 }}>
            {d.glyph}
          </motion.span>
          {!bare && <span className="pr-link__name">
            <small>{d.you ? 'This one' : linked ? 'Linked' : lost ? 'Out of reach' : 'Waiting'}</small>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.b key={d.name} initial={{ y: 16, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -16, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>{d.name}</motion.b>
            </AnimatePresence>
          </span>}
        </motion.span>
      ))}
      <svg className="pr-link__line" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden>
        <motion.path
          ref={line}
          fill="none"
          stroke={lost ? 'var(--stop)' : linked ? 'var(--ink)' : 'var(--dim)'}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={linked ? '200 0' : lost ? '7 7' : '0.5 9'}
          vectorEffect="non-scaling-stroke"
          initial={false}
          animate={{ d: lost ? 'M4 14 C 60 44, 140 44, 196 14' : 'M4 20 C 60 20, 140 20, 196 20', strokeDashoffset: linked ? 0 : [0, -19] }}
          transition={{ d: { type: 'spring', stiffness: 140, damping: 9 }, strokeDashoffset: { duration: 0.9, repeat: linked ? 0 : Infinity, ease: 'linear' } }}
        />
        {linked && <motion.path d="M4 20 C 60 20, 140 20, 196 20" fill="none" stroke="var(--yellow)" strokeWidth={3} strokeLinecap="round" strokeDasharray="8 30" vectorEffect="non-scaling-stroke" initial={{ strokeDashoffset: 0 }} animate={{ strokeDashoffset: phone ? 76 : -76 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} />}
        {pair.traffic.map((t) => <Pulse key={t.id} t={t} phone={phone} />)}
      </svg>
    </div>
  )
}

/** A dot shooting along the link line for each thing passed across, in the direction it went. */
function Pulse({ t, phone }: { t: Traffic; phone: boolean }) {
  // left is the computer: on the computer "in" comes from the right; on the phone "out" goes to the left
  const leftward = phone ? t.dir === 'out' : t.dir === 'in'
  return (
    <motion.circle cy={20} r={6} fill={KIND_COLOR[t.kind] ?? 'var(--ink)'} stroke="var(--ink)" strokeWidth={2} vectorEffect="non-scaling-stroke" initial={{ cx: leftward ? 196 : 4 }} animate={{ cx: leftward ? 4 : 196 }} transition={{ duration: 0.8, ease: [0.45, 0, 0.2, 1] }} onAnimationComplete={() => phone && clearTraffic(t.id)} />
  )
}

