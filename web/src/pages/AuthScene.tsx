import { motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'

/* One small motion graphic per way in, shown in the auth art panel while you hover, focus or use it.
   github   a commit graph: main runs, a branch splits off, gets two commits, merges back
   google   four shapes orbit, gather into one tile, a ring closes around them
   email    password dots fill a field, then the padlock shackle snaps shut
   magic    two chain links slide together and lock, sparkles pop
   passkey  fingerprint ridges draw in, a scan line sweeps, a key turns, check
   Each one replays on a loop by remounting, so the timelines stay simple delays. */

export type Method = 'github' | 'google' | 'email' | 'magic' | 'passkey'

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: 'spring', stiffness: 380, damping: 16 } as const
const fill = (c: string) => ({ fill: c })
const ink = (c: string, w = 6) => ({ fill: 'none', stroke: c, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const })

export const CAPTION: Record<Method, string> = {
  github: 'GitHub · your branch merges into Trailhead',
  google: 'Google · one account, gathered in',
  email: 'Email · eight characters, then the lock',
  magic: 'Magic link · no password, just the link',
  passkey: 'Passkey · your fingerprint is the key',
}

function useLoop(ms: number) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setN((v) => v + 1), ms)
    return () => window.clearInterval(id)
  }, [ms])
  return n
}

const pop = (delay: number) => ({ initial: { scale: 0 }, animate: { scale: 1 }, transition: { ...SPRING, delay } })
const draw = (delay: number, duration = 0.7) => ({ initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration, delay, ease: EASE } })

function GitHubScene() {
  return (
    <>
      <motion.path d="M24 130 H296" style={ink('var(--ink)')} {...draw(0, 0.9)} />
      <motion.path d="M92 130 C124 130 120 66 152 66 H204 C236 66 232 130 246 130" style={ink('var(--orange)')} {...draw(0.55, 1)} />
      {[40, 92].map((x, i) => <motion.circle key={x} cx={x} cy={130} r={11} style={{ ...fill('var(--surface)'), ...ink('var(--ink)', 5) }} {...pop(0.15 + i * 0.2)} />)}
      {[164, 200].map((x, i) => <motion.circle key={x} cx={x} cy={66} r={11} style={{ ...fill('var(--surface)'), ...ink('var(--orange)', 5) }} {...pop(1 + i * 0.22)} />)}
      <motion.circle cx={246} cy={130} r={30} style={ink('var(--lime)', 4)} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: [0.4, 1.4], opacity: [0, 1, 0] }} transition={{ duration: 0.9, delay: 1.75 }} />
      <motion.circle cx={246} cy={130} r={15} style={{ ...fill('var(--lime)'), ...ink('var(--ink)', 5) }} {...pop(1.6)} />
      <motion.circle cx={290} cy={130} r={11} style={{ ...fill('var(--surface)'), ...ink('var(--ink)', 5) }} {...pop(2)} />
      <motion.text x={164} y={36} style={{ ...fill('var(--orange)'), font: '700 13px ui-monospace, monospace' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
        you/first-step
      </motion.text>
    </>
  )
}

function GoogleScene() {
  const shapes = [
    { c: 'var(--blue)', a: 0, node: (p: object) => <motion.circle r={16} {...p} /> },
    { c: 'var(--stop)', a: 90, node: (p: object) => <motion.rect x={-15} y={-15} width={30} height={30} rx={6} {...p} /> },
    { c: 'var(--yellow)', a: 180, node: (p: object) => <motion.path d="M0 -18 L17 12 H-17 Z" {...p} /> },
    { c: 'var(--green)', a: 270, node: (p: object) => <motion.rect x={-16} y={-12} width={32} height={24} rx={12} {...p} /> },
  ]
  const R = 78
  return (
    <>
      <motion.g style={{ x: 160, y: 100 }} initial={{ rotate: 0 }} animate={{ rotate: 270 }} transition={{ duration: 1.6, ease: EASE }}>
        {shapes.map((s, i) => {
          const rad = (s.a * Math.PI) / 180
          const tx = Math.cos(rad + Math.PI / 4) * 19
          const ty = Math.sin(rad + Math.PI / 4) * 19
          return (
            <motion.g key={i} initial={{ x: Math.cos(rad) * R, y: Math.sin(rad) * R, rotate: 0 }} animate={{ x: [Math.cos(rad) * R, Math.cos(rad) * R, tx], y: [Math.sin(rad) * R, Math.sin(rad) * R, ty], rotate: -270 }} transition={{ duration: 1.6, times: [0, 0.45, 1], ease: EASE }}>
              {s.node({ style: { ...fill(s.c), ...ink('var(--ink)', 3) } })}
            </motion.g>
          )
        })}
      </motion.g>
      <motion.circle cx={160} cy={100} r={52} style={{ ...ink('var(--ink)', 6), rotate: -90, originX: '160px', originY: '100px' }} {...draw(1.5, 0.6)} />
      <motion.g {...pop(2.05)} style={{ originX: '212px', originY: '58px' }}>
        <circle cx={212} cy={58} r={16} style={{ ...fill('var(--lime)'), ...ink('var(--ink)', 3) }} />
        <path d="M205 58 l5 5 l9 -10" style={ink('var(--ink)', 4)} />
      </motion.g>
    </>
  )
}

function EmailScene() {
  return (
    <>
      <rect x={30} y={112} width={176} height={46} rx={12} style={{ ...fill('var(--surface)'), ...ink('var(--ink)', 4) }} />
      {Array.from({ length: 8 }, (_, i) => (
        <motion.circle key={i} cx={52 + i * 19} cy={135} r={6} style={fill('var(--ink)')} initial={{ scale: 0, y: -10 }} animate={{ scale: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 + i * 0.13 }} />
      ))}
      <motion.rect x={52 + 8 * 19 - 6} y={124} width={3} height={22} style={fill('var(--violet)')} initial={{ x: -8 * 19 }} animate={{ x: 0, opacity: [1, 0, 1, 0, 1] }} transition={{ x: { duration: 1.05, delay: 0.15, ease: 'linear' }, opacity: { duration: 1.6, delay: 1.2 } }} />
      {/* padlock */}
      <motion.path d="M236 104 V82 a22 22 0 0 1 44 0 V104" style={ink('var(--ink)', 8)} initial={{ y: -18 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 700, damping: 14, delay: 1.45 }} />
      <motion.rect x={224} y={100} width={68} height={58} rx={12} style={ink('var(--ink)', 4)} initial={{ fill: 'var(--butter)' }} animate={{ fill: 'var(--green)' }} transition={{ delay: 1.6, duration: 0.3 }} />
      <motion.g initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...SPRING, delay: 1.7 }} style={{ originX: '258px', originY: '129px' }}>
        <path d="M247 129 l8 8 l14 -16" style={ink('var(--surface)', 6)} />
      </motion.g>
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.6, 1.3] }} transition={{ delay: 1.5, duration: 0.5 }} style={{ originX: '258px', originY: '80px' }}>
        {[-1, 0, 1].map((k) => <path key={k} d={`M${258 + k * 26} ${66 - Math.abs(k) * -6} l${k * 6} -10`} style={ink('var(--orange)', 4)} />)}
      </motion.g>
    </>
  )
}

function MagicScene() {
  const sparks = [[160, 40, 1], [236, 74, 0.7], [92, 150, 0.8], [228, 156, 0.6], [86, 60, 0.6]] as const
  return (
    <>
      <motion.rect x={84} y={78} width={96} height={46} rx={23} style={ink('var(--violet)', 12)} initial={{ x: -60, rotate: -24 }} animate={{ x: 0, rotate: 0 }} transition={{ duration: 0.9, ease: EASE }} />
      <motion.rect x={140} y={78} width={96} height={46} rx={23} style={ink('var(--orange)', 12)} initial={{ x: 60, rotate: 24 }} animate={{ x: 0, rotate: 0 }} transition={{ duration: 0.9, ease: EASE }} />
      {/* the violet link passes back over the orange one on its right edge, so they read as interlocked */}
      <motion.path d="M168 78 A23 23 0 0 1 180 101" style={ink('var(--violet)', 12)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.85, duration: 0.05 }} />
      <motion.circle cx={160} cy={101} r={60} style={ink('var(--lime)', 4)} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: [0.3, 1.5], opacity: [0, 0.9, 0] }} transition={{ delay: 0.9, duration: 0.8 }} />
      {sparks.map(([x, y, s], i) => (
        <motion.path
          key={i}
          d={`M${x} ${y - 14 * s} Q${x} ${y} ${x + 14 * s} ${y} Q${x} ${y} ${x} ${y + 14 * s} Q${x} ${y} ${x - 14 * s} ${y} Q${x} ${y} ${x} ${y - 14 * s} Z`}
          style={{ ...fill(i % 2 ? 'var(--yellow)' : 'var(--ink)'), originX: `${x}px`, originY: `${y}px` }}
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: [0, 1.2, 1], rotate: 0 }}
          transition={{ delay: 1 + i * 0.1, duration: 0.5, ease: EASE }}
        />
      ))}
    </>
  )
}

function PasskeyScene() {
  const ridges = [12, 22, 32, 42, 52]
  return (
    <>
      <g>
        {ridges.map((r, i) => (
          <motion.path
            key={r}
            d={`M${110 - r} ${104 + r * 0.5} C${110 - r} ${104 - r * 1.3} ${110 + r} ${104 - r * 1.3} ${110 + r} ${104 + r * 0.2}${i % 2 ? '' : ` M${110 + r} ${104 + r * 0.45} V${104 + r * 0.9}`}`}
            initial={{ pathLength: 0, stroke: 'var(--ink)' }}
            animate={{ pathLength: 1, stroke: ['var(--ink)', 'var(--ink)', 'var(--green)'] }}
            transition={{ pathLength: { duration: 0.6, delay: i * 0.1, ease: EASE }, stroke: { duration: 1.6, times: [0, 0.8, 1], delay: 0.2 } }}
            style={{ fill: 'none', strokeWidth: 5, strokeLinecap: 'round' }}
          />
        ))}
      </g>
      <motion.rect x={44} width={132} height={4} rx={2} style={fill('var(--blue)')} initial={{ y: 36, opacity: 0 }} animate={{ y: [36, 160, 36], opacity: [0, 1, 1, 0] }} transition={{ delay: 0.6, duration: 1.1, ease: 'easeInOut' }} />
      {/* the key slides in and turns */}
      <motion.g initial={{ x: 90, opacity: 0, rotate: 0 }} animate={{ x: 0, opacity: 1, rotate: [0, 0, 90] }} transition={{ x: { delay: 1.6, duration: 0.5, ease: EASE }, opacity: { delay: 1.6, duration: 0.2 }, rotate: { delay: 1.6, duration: 1, times: [0, 0.5, 1], ease: EASE } }} style={{ originX: '232px', originY: '100px' }}>
        <circle cx={232} cy={100} r={22} style={{ ...fill('var(--yellow)'), ...ink('var(--ink)', 5) }} />
        <circle cx={232} cy={100} r={7} style={fill('var(--ink)')} />
        <path d="M254 100 H300 M284 100 V114 M296 100 V110" style={ink('var(--ink)', 7)} />
      </motion.g>
      <motion.g {...pop(2.6)} style={{ originX: '178px', originY: '50px' }}>
        <circle cx={178} cy={50} r={16} style={{ ...fill('var(--lime)'), ...ink('var(--ink)', 3) }} />
        <path d="M171 50 l5 5 l9 -10" style={ink('var(--ink)', 4)} />
      </motion.g>
    </>
  )
}

const SCENES: Record<Method, { ms: number; node: () => ReactNode }> = {
  github: { ms: 3600, node: () => <GitHubScene /> },
  google: { ms: 3400, node: () => <GoogleScene /> },
  email: { ms: 3400, node: () => <EmailScene /> },
  magic: { ms: 3000, node: () => <MagicScene /> },
  passkey: { ms: 4000, node: () => <PasskeyScene /> },
}

export function AuthScene({ method }: { method: Method }) {
  const n = useLoop(SCENES[method].ms)
  return (
    <svg viewBox="0 0 320 200" className="a-scene__svg" aria-hidden>
      <g key={n}>{SCENES[method].node()}</g>
    </svg>
  )
}
