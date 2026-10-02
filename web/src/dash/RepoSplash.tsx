import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Shape } from '../motion/Shapes'
import { useDash } from './context'
import { lookFor } from './looks'

/* Switching repositories is a change of mountain, so it gets a moment of its own. The new repository's pastel
   floods out from wherever the click landed, its ridge line is inked in, a trail climbs to the summit and the
   repository's mark is planted there as the flag. The name rises letter by letter under a struck-out old one.
   Then the whole sheet lifts away like a page turned upward. A click or any key skips straight to the end. */

const EASE = [0.76, 0, 0.24, 1] as const
const HOLD_MS = 2100
const RIDGE = 'M0 300 L120 236 L196 262 L330 120 L410 196 L470 156 L600 300'
const TRAIL = 'M60 300 C 130 290, 170 278, 214 262 S 290 196, 318 150 S 326 128, 330 120'
const n = (v?: number) => (v ?? 0).toLocaleString()

type Switch = { from: string; to: string; x: number; y: number; id: number }

export function RepoSplash() {
  const { repos } = useDash()
  const reduce = useReducedMotion()
  const [s, setS] = useState<Switch | null>(null)
  const pointer = useRef<[number, number] | null>(null)
  const timer = useRef(0)

  useEffect(() => {
    const onDown = (e: PointerEvent) => (pointer.current = [e.clientX, e.clientY])
    const onKeyDown = () => (pointer.current = null)
    const onSwitch = (e: Event) => {
      const { from, to } = (e as CustomEvent<{ from: string; to: string }>).detail
      const [x, y] = pointer.current ?? [window.innerWidth / 2, window.innerHeight / 2]
      setS({ from, to, x, y, id: Date.now() })
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('th:switch', onSwitch)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('th:switch', onSwitch)
    }
  }, [])

  useEffect(() => {
    if (!s) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setS(null), reduce ? 900 : HOLD_MS)
    // let the opening finish before a stray key can skip it
    let armed = false
    const arm = window.setTimeout(() => (armed = true), 350)
    const skip = () => armed && setS(null)
    window.addEventListener('keydown', skip)
    return () => {
      window.clearTimeout(timer.current)
      window.clearTimeout(arm)
      window.removeEventListener('keydown', skip)
    }
  }, [s?.id])

  const info = s ? repos.find((r) => r.repo === s.to) : undefined
  const look = s ? lookFor(s.to) : null
  const [owner, name] = s ? (s.to.includes('/') ? s.to.split('/') : ['', s.to]) : ['', '']
  const reach = s ? Math.hypot(Math.max(s.x, window.innerWidth - s.x), Math.max(s.y, window.innerHeight - s.y)) + 40 : 0

  return createPortal(
    <AnimatePresence>
      {s && look && (
        <motion.div
          key={s.id}
          className="rsp"
          role="status"
          aria-live="assertive"
          aria-label={`Switched to ${s.to}`}
          style={{ ['--rsp-bg' as string]: look.bg, ['--rsp-fg' as string]: look.color }}
          onPointerDown={() => setS(null)}
          initial={{ clipPath: `circle(0px at ${s.x}px ${s.y}px)`, y: 0 }}
          animate={{ clipPath: `circle(${reach}px at ${s.x}px ${s.y}px)`, y: 0 }}
          exit={{ y: '-100%', transition: { duration: 0.75, ease: EASE } }}
          transition={{ duration: reduce ? 0.01 : 0.7, ease: EASE }}
        >
          <motion.div className="rsp-inner" exit={{ y: '-30%', transition: { duration: 0.75, ease: EASE } }}>
            <div className="rsp-top mono">
              <span>Changing trails</span>
              <span className="rsp-from">
                <motion.s initial={{ ['--strike' as string]: '0%' }} animate={{ ['--strike' as string]: '100%' }} transition={{ delay: 0.45, duration: 0.4, ease: EASE }}>{s.from}</motion.s>
                <span aria-hidden>→</span>
                <motion.b initial={{ x: -10, clipPath: 'inset(0 100% 0 0)' }} animate={{ x: 0, clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 0.8, duration: 0.45, ease: EASE }}>{s.to}</motion.b>
              </span>
            </div>

            <svg viewBox="0 0 600 300" className="rsp-scene" preserveAspectRatio="xMidYMax meet" aria-hidden>
              <motion.path d={`${RIDGE} Z`} className="rsp-hill" initial={{ y: 60 }} animate={{ y: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 90, damping: 18 }} />
              <motion.path d="M330 120 L410 196 L370 300 L300 300 Z" className="rsp-shade" initial={{ y: 60 }} animate={{ y: 0 }} transition={{ delay: 0.25, type: 'spring', stiffness: 90, damping: 18 }} />
              <motion.path d="M308 144 L330 120 L352 141 L340 136 L330 146 L320 138 Z" className="rsp-snow" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring', stiffness: 300, damping: 16 }} style={{ transformBox: 'fill-box', transformOrigin: 'center top' }} />
              <motion.path d={RIDGE} className="rsp-ridge" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: reduce ? 0.01 : 0.9, ease: EASE }} />
              <motion.path d={TRAIL} className="rsp-trail" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.75, duration: reduce ? 0.01 : 0.8, ease: 'easeInOut' }} />
              <g transform="translate(330 120)">
                <motion.path d="M0 0 V-58" className="rsp-pole" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.35, duration: 0.25 }} />
              </g>
              <foreignObject x={312} y={14} width={84} height={84}>
                <motion.div
                  className="rsp-mark"
                  initial={{ scale: 0, rotate: -50, y: 30 }}
                  animate={{ scale: 1, rotate: 0, y: 0 }}
                  transition={{ delay: reduce ? 0 : 1.5, type: 'spring', stiffness: 380, damping: 13 }}
                >
                  <Shape kind={look.kind} color={look.color} glyph={look.glyph} size={56} play={false} />
                </motion.div>
              </foreignObject>
            </svg>


            <div className="rsp-copy">
              {owner && (
                <motion.span className="rsp-owner mono" initial={{ y: 20, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ delay: 0.5, duration: 0.5, ease: EASE }}>
                  {owner} /
                </motion.span>
              )}
              <h2 className="rsp-name" aria-hidden>
                {[...name].map((c, i) => (
                  <span key={i} className="rsp-char">
                    <motion.span initial={{ y: '110%', rotate: 8 }} animate={{ y: '0%', rotate: 0 }} transition={{ delay: 0.55 + i * 0.035, type: 'spring', stiffness: 260, damping: 20 }}>
                      {c}
                    </motion.span>
                  </span>
                ))}
              </h2>
              {info && (
                <motion.p className="rsp-line" initial={{ y: 16, clipPath: 'inset(0 100% 0 0)' }} animate={{ y: 0, clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 1.1, duration: 0.6, ease: EASE }}>
                  {n(info.files)} files and {n(info.commits)} commits to explore{info.pull_requests ? `, with ${n(info.pull_requests)} pull requests behind them` : ''}.
                </motion.p>
              )}
            </div>
            <motion.span className="rsp-skip mono" initial={{ y: 20 }} animate={{ y: 0 }} transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 22 }}>
              click or press any key to go on
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
