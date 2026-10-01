import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { useRef, useState } from 'react'
import { Marquee } from '../motion/Marquee'
import { Shape, STORY } from '../motion/Shapes'

/* Mile 1, a pinned motion graphic in three scenes, told with tiles and shapes.
   1. Lost: a grid of files; the grep lens snakes across it and every tile it touches lights up as a match.
   2. A signal: Jev's light turns, and a verdict ripples out from it: most tiles go red and shrink, three go green.
   3. The trail: the field floods mint, the three kept tiles fly into a switchback trail and become stops,
      and the "you" flag walks it as you scroll. */

const EASE = [0.22, 1, 0.36, 1] as const
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const COLS = 8
const ROWS = 5
const N = COLS * ROWS
// Tile centres in % of the 4:3 field.
const cell = (i: number) => {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  return { x: 9 + c * (82 / (COLS - 1)), y: 13 + r * (74 / (ROWS - 1)) }
}
// The lens snakes row by row.
const snake = (i: number) => {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  return r * COLS + (r % 2 ? COLS - 1 - c : c)
}
const BY_SNAKE = Array.from({ length: N }, (_, i) => i).sort((a, b) => snake(a) - snake(b))
// Jev's verdict ripples out from the signal, top right.
const DIST = (() => {
  const d = Array.from({ length: N }, (_, i) => {
    const { x, y } = cell(i)
    return Math.hypot(x - 100, y + 4)
  })
  const lo = Math.min(...d)
  const hi = Math.max(...d)
  return d.map((v) => (v - lo) / (hi - lo))
})()

const KEEP: Record<number, number> = { 10: 0, 21: 1, 35: 2 }
const STOPS = [
  { x: 15, y: 80, label: 'README.md', story: STORY[0] },
  { x: 47, y: 30, label: 'middlewares/', story: STORY[1] },
  { x: 83, y: 70, label: 'retry.py', story: STORY[3] },
]
const TRAIL = `M${STOPS.map((s) => `${s.x} ${s.y * 0.75}`).join(' L')}`
const SEG = [Math.hypot(STOPS[1].x - STOPS[0].x, STOPS[1].y - STOPS[0].y), Math.hypot(STOPS[2].x - STOPS[1].x, STOPS[2].y - STOPS[1].y)]
const along = (t: number) => {
  const d = t * (SEG[0] + SEG[1])
  const [a, b, k] = d < SEG[0] ? [STOPS[0], STOPS[1], d / SEG[0]] : [STOPS[1], STOPS[2], (d - SEG[0]) / SEG[1]]
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }
}

const SCENES = [
  { kicker: 'Mile 1 · lost', a: 'No more grepping', b: 'in the dark.', lead: '1,284 matches for “retry”. Which one matters? Where do you even start?' },
  { kicker: 'Mile 1 · a signal', a: 'Jev reads', b: 'every sign.', lead: 'Each candidate gets a calibrated decision: keep it, prune it, or not sure yet. Code keeps the best few and drops the rest.' },
  { kicker: 'Mile 1 · the trail', a: 'Then you just', b: 'follow the trail.', lead: 'Where is it, how does it work, why was it built this way, what breaks if I change it. Answered from the code and its history, with the receipts attached.' },
]

const LENS = [0.03, 0.27] as const
const JUDGE = 0.33
const FLY = [0.62, 0.76] as const

export function Lost() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const [scene, setScene] = useState(0)
  const [light, setLight] = useState(0)

  useMotionValueEvent(p, 'change', (v) => {
    setScene(v < 0.3 ? 0 : v < 0.6 ? 1 : 2)
    setLight(v < 0.3 ? 0 : v < 0.36 ? 1 : 2)
  })

  const sweep = useTransform(p, (v) => clamp01((v - LENS[0]) / (LENS[1] - LENS[0])))
  const lensPos = (t: number) => {
    const k = t * (N - 1)
    const a = cell(BY_SNAKE[Math.floor(k)])
    const b = cell(BY_SNAKE[Math.min(N - 1, Math.ceil(k))])
    return { x: lerp(a.x, b.x, k % 1), y: lerp(a.y, b.y, k % 1) }
  }
  const lensX = useTransform(sweep, (t) => `${lensPos(t).x.toFixed(2)}%`)
  const lensY = useTransform(sweep, (t) => `${lensPos(t).y.toFixed(2)}%`)
  const lensS = useTransform(p, (v) => smooth(0, 0.03, v) * (1 - smooth(0.27, 0.32, v)))
  const matches = useTransform(sweep, (t) => Math.round(t * 1284).toLocaleString('en-US'))
  const dropped = useTransform(p, (v) => Math.round(smooth(JUDGE, JUDGE + 0.2, v) * 1281).toLocaleString('en-US'))
  const flood = useTransform(p, (v) => `circle(${(smooth(0.58, 0.7, v) * 150).toFixed(2)}% at 92% 4%)`)
  const trail = useTransform(p, (v) => smooth(0.7, 0.86, v))
  const walk = useTransform(p, (v) => smooth(0.8, 0.98, v))
  const flagX = useTransform(walk, (t) => `${along(t).x.toFixed(2)}%`)
  const flagY = useTransform(walk, (t) => `${along(t).y.toFixed(2)}%`)
  const flagS = useTransform(p, (v) => smooth(0.74, 0.8, v))

  const s = SCENES[scene]
  return (
    <>
      <section ref={ref} id="lost" className="l-lost t-lilac" aria-label="From grepping in the dark to a trail">
        <div className="l-lost__stage">
          <div className="l-lost__copy">
            <AnimatePresence mode="wait">
              <motion.div key={scene} initial="in" animate="on" exit="out">
                <motion.div className="l-chip l-lost__chip" variants={{ in: { opacity: 0, y: 14 }, on: { opacity: 1, y: 0 }, out: { opacity: 0, y: -10 } }} transition={{ duration: 0.4, ease: EASE }}>
                  <span className="l-chip__blaze" /> {s.kicker}
                </motion.div>
                <h2 className="h-section l-lost__title">
                  {[s.a, s.b].map((line, i) => (
                    <span key={line} className="l-lost__line">
                      <motion.span
                        className={i === 1 ? 'l-lost__accent' : undefined}
                        variants={{ in: { y: '110%', rotate: 3 }, on: { y: '0%', rotate: 0 }, out: { y: '-110%', rotate: -2 } }}
                        transition={{ duration: 0.65, delay: i * 0.08, ease: [0.76, 0, 0.24, 1] }}
                      >
                        {line}
                      </motion.span>
                    </span>
                  ))}
                </h2>
                <motion.p className="body l-lost__lead" variants={{ in: { opacity: 0, y: 18 }, on: { opacity: 1, y: 0 }, out: { opacity: 0 } }} transition={{ duration: 0.5, delay: 0.18, ease: EASE }}>
                  {s.lead}
                </motion.p>
              </motion.div>
            </AnimatePresence>
            <div className="l-lost__progress" aria-hidden>
              {SCENES.map((_, i) => <span key={i} className={i <= scene ? 'is-on' : ''} />)}
            </div>
          </div>

          <div className="l-mg" aria-hidden>
            <motion.div className="l-mg__flood" style={{ clipPath: flood }} />
            <div className="l-mg__bar">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={scene} className="mono l-mg__status" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.25 }}>
                  {scene === 0 && <>$ grep -rn "retry" . <b><motion.span>{matches}</motion.span> matches</b></>}
                  {scene === 1 && <>Jev · 3 keep · <b className="is-stop"><motion.span>{dropped}</motion.span> drop</b></>}
                  {scene === 2 && <>trail · <b className="is-go">3 stops, in order</b></>}
                </motion.div>
              </AnimatePresence>
              <div className="l-mg__signal">
                {['var(--stop)', 'var(--yellow)', 'var(--go)'].map((c, i) => (
                  <span key={i} style={{ background: i === light ? c : undefined }} className={i === light ? 'is-on' : ''} />
                ))}
              </div>
            </div>

            <div className="l-mg__field">
              <svg className="l-mg__trail" viewBox="0 0 100 75">
                <motion.path d={TRAIL} fill="none" stroke="var(--solid)" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" style={{ pathLength: trail }} />
                <motion.path d={TRAIL} fill="none" stroke="var(--yellow)" strokeWidth={0.35} strokeDasharray="1.2 1.4" strokeLinecap="round" style={{ opacity: trail }} />
              </svg>
              {Array.from({ length: N }, (_, i) => <Tile key={i} i={i} p={p} sweep={sweep} />)}

              <motion.div className="l-mg__lens" style={{ left: lensX, top: lensY, scale: lensS }}>
                <Shape kind="circle" color="var(--yellow)" glyph="grep" size={0} style={{ width: '100%', height: 'auto' }} />
              </motion.div>

              <motion.div className="l-mg__flag" style={{ left: flagX, top: flagY, scale: flagS }}>
                <Shape kind="tag" color="var(--orange)" glyph="flag" size={0} style={{ width: '100%', height: 'auto' }} />
                <span>you</span>
              </motion.div>
            </div>
          </div>
        </div>
      </section>
      <div className="l-band" aria-hidden>
        <Marquee speed={36}>
          {['Where is it?', 'How does it work?', 'Why is it like this?', 'What breaks?', 'How do I run it?'].map((q, i) => (
            <span className="l-band__item" key={q}>
              {q}
              <Shape kind={STORY[i % 5].kind} color={STORY[i % 5].color} glyph={STORY[i % 5].glyph} size={34} play={false} />
            </span>
          ))}
        </Marquee>
      </div>
    </>
  )
}

/** One file tile: dim, then a grep match, then judged, then either gone or flown into a trail stop. */
function Tile({ i, p, sweep }: { i: number; p: MotionValue<number>; sweep: MotionValue<number> }) {
  const home = cell(i)
  const keep = KEEP[i]
  const kept = keep !== undefined
  const stop = kept ? STOPS[keep] : null
  const at = snake(i) / (N - 1)
  const judgeAt = JUDGE + DIST[i] * 0.18

  const bg = useTransform([p, sweep] as MotionValue<number>[], ([v, t]: number[]) =>
    v >= judgeAt ? (kept ? 'var(--green)' : 'var(--stop)') : t >= at - 0.004 && v > LENS[0] ? 'var(--yellow)' : 'color-mix(in srgb, var(--violet) 22%, var(--surface))',
  )
  const fly = useTransform(p, (v) => (kept ? smooth(FLY[0], FLY[1], v) : 0))
  const left = useTransform(fly, (f) => `${lerp(home.x, stop?.x ?? home.x, f).toFixed(2)}%`)
  const top = useTransform(fly, (f) => `${lerp(home.y, stop?.y ?? home.y, f).toFixed(2)}%`)
  const scale = useTransform([p, sweep] as MotionValue<number>[], ([v, t]: number[]) => {
    const pop = t >= at - 0.004 && v < 0.3 ? 1 + 0.12 * (1 - clamp01((t - at) * 14)) : 1
    if (kept) return pop * (1 + 0.15 * smooth(judgeAt, judgeAt + 0.02, v)) * lerp(1, 1.45, smooth(FLY[0], FLY[1], v))
    return pop * lerp(1, 0.42, smooth(judgeAt, judgeAt + 0.03, v)) * (1 - smooth(0.6, 0.68, v))
  })
  const rotate = useTransform(p, (v) => (kept ? smooth(FLY[0], FLY[1], v) * (keep === 1 ? -8 : 8) : 0))
  const opacity = useTransform(p, (v) => (kept ? 1 : lerp(1, 0.4, smooth(judgeAt, judgeAt + 0.03, v))))
  const face = useTransform(fly, (f) => 1 - smooth(0.4, 0.8, f))
  const icon = useTransform(fly, (f) => smooth(0.4, 0.8, f))
  const check = useTransform([p, fly] as MotionValue<number>[], ([v, f]: number[]) => smooth(judgeAt, judgeAt + 0.02, v) * (1 - f))
  const label = useTransform(p, (v) => smooth(0.74, 0.8, v))

  return (
    <motion.div className={`l-tile${kept ? ' is-kept' : ''}`} style={{ left, top, scale, rotate, opacity }}>
      <motion.div className="l-tile__face" style={{ background: bg, opacity: face }}>
        <i /><i /><i />
        {kept && <motion.b style={{ scale: check }}>✓</motion.b>}
      </motion.div>
      {stop && (
        <>
          <motion.div className="l-tile__icon" style={{ opacity: icon, scale: icon }}>
            <Shape kind={stop.story.kind} color={stop.story.color} glyph={stop.story.glyph} size={0} style={{ width: '100%', height: 'auto' }} />
          </motion.div>
          <motion.span className="l-tile__n" style={{ scale: label }}>{keep! + 1}</motion.span>
          <motion.span className="l-tile__label mono" style={{ opacity: label, rotate: keep === 1 ? 8 : -8 }}>{stop.label}</motion.span>
        </>
      )}
    </motion.div>
  )
}
