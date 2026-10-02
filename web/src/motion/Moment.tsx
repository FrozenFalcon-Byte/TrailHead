import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useMoment, type Active, type MomentMethod } from '../lib/moment'
import { Shape, STORY } from './Shapes'
import { SplitReveal } from './SplitReveal'

/* The full-screen scenes for the big moments. An iris opens out of the point you pressed, a disc springs up
   with the method's own little animation drawn in ink, the five story shapes swing out into orbit, and the
   words set in. The app changes underneath while it is covered; then the backdrop splits into columns that
   drop away, the shapes fly off, and you are on the new page. */

const EASE = [0.76, 0, 0.24, 1] as const
const INK = 'var(--solid)'
const COLS = 6

type Look = { bg: string; accent: string }
const LOOK: Record<string, Look> = {
  github: { bg: 'var(--lilac)', accent: 'var(--violet)' },
  google: { bg: 'var(--sky)', accent: 'var(--blue)' },
  email: { bg: 'var(--sky)', accent: 'var(--blue)' },
  magic: { bg: 'var(--butter)', accent: 'var(--yellow)' },
  passkey: { bg: 'var(--mint)', accent: 'var(--green)' },
  signout: { bg: 'var(--peach)', accent: 'var(--orange)' },
}
const METHOD_NAME: Record<MomentMethod, string> = { github: 'GitHub', google: 'Google', email: 'email', magic: 'a magic link', passkey: 'a passkey' }

const draw = (delay: number, duration = 0.6) => ({ initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 }, transition: { pathLength: { delay, duration, ease: EASE }, opacity: { delay, duration: 0.01 } } })
const pop = (delay: number) => ({ initial: { scale: 0 }, animate: { scale: 1 }, transition: { type: 'spring' as const, stiffness: 420, damping: 14, delay } })
const fadeOut = (at: number) => ({ animate: { opacity: [1, 1, 0] }, transition: { times: [0, 0.8, 1], duration: at } })

function Check({ at }: { at: number }) {
  return <motion.path d="M96 132 L121 157 L166 104" fill="none" stroke={INK} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" {...draw(at, 0.45)} />
}

/** The ink drawing inside the disc. Each method first acts out how it signs you in, then turns into a tick. */
function Glyph({ a }: { a: Active }) {
  const S = { fill: 'none', stroke: INK, strokeWidth: 10, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (a.kind === 'signout')
    return (
      <g>
        <motion.rect x={92} y={80} width={62} height={100} rx={8} {...S} {...draw(0.4)} />
        <motion.path d="M92 80 L130 92 V188 L92 180 Z" fill={INK} initial={{ scaleX: 1 }} animate={{ scaleX: [1, 1, 0.35] }} transition={{ duration: 1.1, delay: 0.5, times: [0, 0.4, 1], ease: EASE }} style={{ originX: '92px' }} />
        <motion.g initial={{ x: -30, opacity: 0 }} animate={{ x: 18, opacity: 1 }} transition={{ delay: 1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <path d="M140 130 H186 M172 116 L186 130 L172 144" {...S} />
        </motion.g>
      </g>
    )
  if (a.kind === 'passkey')
    return (
      <g>
        <motion.g {...fadeOut(1.5)}>
          {[18, 32, 46].map((r, i) => (
            <motion.path key={r} d={`M${130 - r} ${150} A ${r} ${r + 6} 0 1 1 ${130 + r} ${150}`} {...S} strokeWidth={8} {...draw(0.35 + i * 0.12, 0.5)} />
          ))}
          <motion.rect x={70} width={120} height={5} rx={2.5} fill={INK} initial={{ y: 90, opacity: 0 }} animate={{ y: [90, 170, 90], opacity: [0, 1, 0] }} transition={{ delay: 0.6, duration: 0.9, ease: 'easeInOut' }} />
        </motion.g>
        <motion.g initial={{ opacity: 0, rotate: -70, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} transition={{ delay: 1.45, type: 'spring', stiffness: 260, damping: 15 }} style={{ originX: '130px', originY: '130px' }}>
          <circle cx={102} cy={130} r={20} {...S} />
          <path d="M122 130 H178 M160 130 V148 M174 130 V142" {...S} />
        </motion.g>
        <motion.g {...pop(2)}>
          <circle cx={182} cy={84} r={18} fill="var(--lime)" stroke={INK} strokeWidth={4} />
          <path d="M174 84 L180 90 L191 78" fill="none" stroke={INK} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
        </motion.g>
      </g>
    )
  switch (a.method) {
    case 'github':
      return (
        <g>
          <motion.g {...fadeOut(1.35)}>
            <motion.path d="M100 88 V174" {...S} {...draw(0.35)} />
            <motion.path d="M100 112 Q100 138 130 138 H162" {...S} {...draw(0.6)} />
            {[[100, 88], [100, 174], [162, 138]].map(([cx, cy], i) => <motion.circle key={i} cx={cx} cy={cy} r={11} fill={INK} {...pop(0.4 + i * 0.18)} />)}
            <motion.circle cy={138} r={9} fill="var(--lime)" stroke={INK} strokeWidth={3} initial={{ cx: 100, opacity: 0 }} animate={{ cx: [100, 100, 162], opacity: [0, 1, 1] }} transition={{ delay: 0.75, duration: 0.6 }} />
          </motion.g>
          <Check at={1.35} />
        </g>
      )
    case 'magic':
      return (
        <g>
          <motion.g {...fadeOut(1.4)}>
            <motion.path d="M88 176 L150 114" {...S} {...draw(0.35, 0.45)} />
            <motion.path d="M162 84 L168 100 L184 106 L168 112 L162 128 L156 112 L140 106 L156 100 Z" fill={INK} {...pop(0.65)} />
            {[[104, 96], [186, 150], [128, 82]].map(([x, y], i) => (
              <motion.circle key={i} cx={x} cy={y} r={6} fill={INK} initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 0] }} transition={{ delay: 0.8 + i * 0.12, duration: 0.6 }} />
            ))}
          </motion.g>
          <Check at={1.4} />
        </g>
      )
    case 'passkey':
      return (
        <g>
          <motion.g {...fadeOut(1.4)}>
            {[16, 30, 44].map((r, i) => <motion.path key={r} d={`M${130 - r} 156 A ${r} ${r + 6} 0 1 1 ${130 + r} 156`} {...S} strokeWidth={8} {...draw(0.35 + i * 0.12, 0.45)} />)}
            <motion.rect x={72} width={116} height={5} rx={2.5} fill={INK} initial={{ y: 92, opacity: 0 }} animate={{ y: [92, 172], opacity: [1, 0] }} transition={{ delay: 0.7, duration: 0.6 }} />
          </motion.g>
          <Check at={1.4} />
        </g>
      )
    default:
      // email and password
      return (
        <g>
          <motion.g {...fadeOut(1.4)}>
            <motion.rect x={80} y={96} width={100} height={70} rx={10} {...S} {...draw(0.35)} />
            <motion.path d="M82 100 L130 138 L178 100" {...S} {...draw(0.6, 0.4)} />
            {[0, 1, 2, 3].map((i) => <motion.circle key={i} cx={104 + i * 17} cy={190} r={5} fill={INK} {...pop(0.8 + i * 0.08)} />)}
          </motion.g>
          <Check at={1.4} />
        </g>
      )
  }
}

function words(a: Active) {
  const first = (a.name || '').split(' ')[0]
  if (a.kind === 'signout') return { kicker: 'Signed out', lead: 'See you on', hl: 'the trail', tail: first ? `, ${first}` : '' }
  if (a.kind === 'passkey') return { kicker: a.detail || 'Passkey saved', lead: 'Passkey', hl: 'saved', tail: '' }
  return { kicker: `Signed in with ${METHOD_NAME[a.method ?? 'email']}`, lead: first ? 'Welcome,' : 'Welcome', hl: first || 'back', tail: '' }
}

function Scene({ a }: { a: Active }) {
  const [phase, setPhase] = useState<'in' | 'out'>('in')
  const look = LOOK[a.kind === 'signout' ? 'signout' : a.kind === 'passkey' ? 'passkey' : (a.method ?? 'email')]
  const w = words(a)
  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => a.covered(), 760)
    const min = new Promise((r) => window.setTimeout(r, a.kind === 'passkey' ? 2900 : 2500))
    Promise.all([min, a.hold.catch(() => undefined)]).then(() => {
      if (!alive) return
      setPhase('out')
      window.setTimeout(() => alive && a.done(), 1050)
    })
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [a])

  const R = Math.hypot(Math.max(a.x, window.innerWidth - a.x), Math.max(a.y, window.innerHeight - a.y)) + 20
  return (
    <div className="mo" role="status" aria-live="assertive" aria-label={`${w.kicker}. ${w.lead} ${w.hl}${w.tail}`} style={{ ['--mo-bg' as string]: look.bg, ['--mo-accent' as string]: look.accent }}>
      {phase === 'in' ? (
        <motion.div className="mo__iris" initial={{ clipPath: `circle(0px at ${a.x}px ${a.y}px)` }} animate={{ clipPath: `circle(${R}px at ${a.x}px ${a.y}px)` }} transition={{ duration: 0.8, ease: EASE }} />
      ) : (
        Array.from({ length: COLS }, (_, i) => (
          <motion.div key={i} className="mo__col" style={{ left: `${(i * 100) / COLS}%` }} initial={{ y: '0%' }} animate={{ y: i % 2 ? '-102%' : '102%' }} transition={{ duration: 0.85, delay: 0.12 + Math.abs(i - (COLS - 1) / 2) * 0.06, ease: EASE }} />
        ))
      )}
      <motion.div className="mo__stage" animate={phase === 'out' ? { opacity: 0, scale: 0.86, y: -30 } : { opacity: 1, scale: 1, y: 0 }} transition={phase === 'out' ? { duration: 0.35, ease: EASE } : { duration: 0.01 }}>
        <div className="mo__art">
          <motion.div className="mo__orbit" animate={{ rotate: 40 }} transition={{ duration: 4, ease: 'linear' }}>
            {STORY.map((st, i) => {
              const ang = (i / STORY.length) * Math.PI * 2 - Math.PI / 2
              return (
                <motion.span
                  key={i}
                  className="mo__sat"
                  initial={{ x: 0, y: 0, scale: 0, rotate: -90 }}
                  animate={phase === 'out' ? { x: Math.cos(ang) * 900, y: Math.sin(ang) * 900, scale: 0.6, rotate: 180 } : { x: Math.cos(ang) * 168, y: Math.sin(ang) * 168, scale: 1, rotate: 0 }}
                  transition={phase === 'out' ? { duration: 0.7, ease: EASE } : { type: 'spring', stiffness: 160, damping: 13, delay: 0.55 + i * 0.07 }}
                >
                  <motion.span style={{ display: 'block', lineHeight: 0 }} animate={{ rotate: -40 }} transition={{ duration: 4, ease: 'linear' }}>
                    <Shape kind={st.kind} color={st.color} glyph={st.glyph} size={46} />
                  </motion.span>
                </motion.span>
              )
            })}
          </motion.div>
          <svg viewBox="0 0 260 260" className="mo__svg" aria-hidden>
            <motion.circle cx={130} cy={130} r={118} fill="none" stroke={INK} strokeWidth={3} strokeDasharray="4 12" strokeLinecap="round" initial={{ pathLength: 0, rotate: 0 }} animate={{ pathLength: 1, rotate: 120 }} transition={{ pathLength: { duration: 1, delay: 0.4, ease: EASE }, rotate: { duration: 4, ease: 'linear' } }} style={{ originX: '130px', originY: '130px' }} />
            <motion.circle cx={130} cy={130} r={94} fill={look.accent} initial={{ scale: 0 }} animate={{ scale: [0, 1.12, 1] }} transition={{ duration: 0.7, delay: 0.3, times: [0, 0.6, 1], ease: 'easeOut' }} style={{ originX: '130px', originY: '130px' }} />
            <Glyph a={a} />
          </svg>
        </div>
        <motion.span className="mo__kicker mono" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.5 }}>
          {w.kicker}
        </motion.span>
        <h2 className="display mo__title">
          <SplitReveal text={w.lead} immediate delay={0.85} />{' '}
          <motion.span className="mo__hl" initial={{ clipPath: 'inset(0 100% 0 0 round 0.16em)' }} animate={{ clipPath: 'inset(0 0% 0 0 round 0.16em)' }} transition={{ duration: 0.7, delay: 1.05, ease: EASE }}>
            {w.hl}
          </motion.span>
          {w.tail && <SplitReveal text={w.tail} immediate delay={1.2} />}
        </h2>
        {a.kind === 'passkey' && (
          <motion.p className="body mo__note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
            Next time, choose “Sign in with a passkey” and use your fingerprint, face or device PIN.
          </motion.p>
        )}
      </motion.div>
    </div>
  )
}

export function MomentLayer() {
  const a = useMoment()
  return <AnimatePresence>{a && <Scene key={a.id} a={a} />}</AnimatePresence>
}
