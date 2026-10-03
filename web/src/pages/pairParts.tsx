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
export const KIND_LABEL: Record<string, string> = { go: 'Steer', ask: 'Ask', drop: 'Pass', ring: 'Ring', tap: 'Point', menu: 'Menu', bye: 'Bye' }
export const KIND_COLOR: Record<string, string> = { go: 'var(--blue)', ask: 'var(--violet)', drop: 'var(--orange)', ring: 'var(--yellow)', tap: 'var(--green)', menu: 'var(--plum)', bye: 'var(--stop)' }

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
  if (kind === 'menu')
    return (
      <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
        <path d="M5 4 H19 V20 H5 Z" {...stroke} />
        {[0, 1, 2].map((i) => (
          <motion.path key={i} d={`M8 ${9 + i * 3.5} H16`} {...stroke} animate={{ pathLength: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15 }} />
        ))}
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

const BEADS = ['var(--orange)', 'var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--violet)', 'var(--orange)', 'var(--yellow)']

/** The two devices side by side with a string of beads between them. Linked, the beads ripple in a wave running
 *  towards the other device; waiting, they chase each other in grey; out of reach, they drop and lie where they fell.
 *  Everything passed across hops over the beads as a coloured packet and lands on the other tile with a bump. */
export function LinkLine({ status, peer, phone = false, bare = false }: { status: string; peer: string; phone?: boolean; bare?: boolean }) {
  const linked = status === 'linked'
  const lost = status === 'lost'
  const pair = usePair()
  const tiles = useRef<(HTMLSpanElement | null)[]>([])
  const me = deviceName()
  const devices = [
    { key: 'screen', name: phone ? peer || 'Computer' : me, glyph: <ScreenGlyph size={22} />, bg: 'var(--butter)', you: !phone },
    { key: 'phone', name: phone ? me : peer || 'Your phone', glyph: <PhoneGlyph size={22} live={linked} />, bg: 'var(--peach)', you: phone },
  ]
  // the wave runs away from this device, towards the other one
  const order = (i: number) => (phone ? BEADS.length - 1 - i : i)
  return (
    <div className={`pr-link is-${status}`}>
      {devices.map((d, i) => (
        <motion.span key={d.key} className={`pr-link__dev ${i ? 'is-right' : ''}`} animate={{ x: linked ? (i ? -4 : 4) : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 12 }}>
          <motion.span ref={(el) => { tiles.current[i] = el }} className="pr-link__tile" style={{ background: d.bg }} animate={!linked && !lost && !d.you ? { scale: [1, 0.9, 1] } : { scale: 1 }} transition={{ duration: 1.4, repeat: !linked && !lost && !d.you ? Infinity : 0 }}>
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
      <div className="pr-link__beads" aria-hidden>
        {BEADS.map((c, i) => (
          <Bead key={`${status}-${i}`} color={c} k={order(i)} n={BEADS.length} status={status} />
        ))}
        {pair.traffic.map((t) => (
          <Hop key={t.id} t={t} phone={phone} onLand={(left) => {
            tiles.current[left ? 0 : 1]?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.22) rotate(-8deg)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
            if (phone) clearTraffic(t.id)
          }} />
        ))}
      </div>
    </div>
  )
}

function Bead({ color, k, n, status }: { color: string; k: number; n: number; status: string }) {
  if (status === 'linked')
    return (
      <motion.i
        className="pr-bead"
        style={{ background: color }}
        initial={{ scale: 0, y: -18 }}
        animate={{ scale: [1, 1.3, 1], y: [0, -9, 0] }}
        transition={{
          scale: { duration: 1.2, repeat: Infinity, delay: 0.35 + k * 0.11, ease: 'easeInOut' },
          y: { duration: 1.2, repeat: Infinity, delay: 0.35 + k * 0.11, ease: 'easeInOut' },
          default: { type: 'spring', stiffness: 400, damping: 14, delay: Math.abs(k - (n - 1) / 2) * 0.05 },
        }}
      />
    )
  if (status === 'lost')
    return (
      <motion.i
        className="pr-bead is-down"
        initial={{ y: 0, rotate: 0 }}
        animate={{ y: 13, rotate: (k % 2 ? 1 : -1) * (20 + k * 7), x: (k - (n - 1) / 2) * 2 }}
        transition={{ type: 'spring', stiffness: 260, damping: 9, delay: k * 0.05 }}
      />
    )
  return <motion.i className="pr-bead is-wait" animate={{ scale: [0.45, 1, 0.45] }} transition={{ duration: 1.1, repeat: Infinity, delay: k * 0.12, ease: 'easeInOut' }} />
}

/** A packet hopping over the beads in the direction it went, landing on the other tile. */
function Hop({ t, phone, onLand }: { t: Traffic; phone: boolean; onLand: (left: boolean) => void }) {
  // left is the computer: on the computer "in" comes from the right; on the phone "out" goes to the left
  const leftward = phone ? t.dir === 'out' : t.dir === 'in'
  const from = leftward ? '100%' : '0%'
  const to = leftward ? '0%' : '100%'
  return (
    <motion.span
      className="pr-hop"
      style={{ background: KIND_COLOR[t.kind] ?? 'var(--ink)' }}
      initial={{ left: from, y: 0, scale: 0, rotate: 0 }}
      animate={{ left: [from, to], y: [0, -26, -4, -20, -2, -12, 0], scale: [0, 1.15, 1, 1, 1, 1, 0.6], rotate: leftward ? [0, -200] : [0, 200] }}
      transition={{ duration: 0.95, ease: [0.45, 0, 0.3, 1], y: { duration: 0.95, ease: 'easeInOut' }, scale: { duration: 0.95 } }}
      onAnimationComplete={() => onLand(leftward)}
    >
      <UseArt kind={t.kind === 'point' ? 'tap' : t.kind} />
    </motion.span>
  )
}
