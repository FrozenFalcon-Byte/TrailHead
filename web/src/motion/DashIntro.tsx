import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ALL } from '../dash/nav'
import { Mark } from './Mark'
import { Shape } from './Shapes'

const WORDS = ['Unpacking your trail', 'Lighting the signposts', 'Reading the map', 'Lacing up']
const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)'
const FLY_MS = 950

/** FLIP `el` onto `target`: same centre, same untransformed size, same tilt, so the hand-off is invisible. */
function flyTo(el: HTMLElement | null, target: Element | null, delay = 0) {
  if (!el) return Promise.resolve()
  const t = target as HTMLElement | null
  if (!t || !t.offsetWidth) return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay, fill: 'forwards' }).finished
  const a = el.getBoundingClientRect()
  const b = t.getBoundingClientRect()
  const dx = b.left + b.width / 2 - (a.left + a.width / 2)
  const dy = b.top + b.height / 2 - (a.top + a.height / 2)
  const m = new DOMMatrix(getComputedStyle(t).transform === 'none' ? undefined : getComputedStyle(t).transform)
  const tilt = (Math.atan2(m.b, m.a) * 180) / Math.PI
  // Size by the drawings themselves: the wrappers around them are not the same size.
  const px = (n: Element | null) => Number(n?.getAttribute('width')) || 0
  const from = px(el.querySelector('svg')) || el.offsetWidth
  const to = px(t.querySelector('svg')) || t.offsetWidth
  const scale = (to * Math.hypot(m.a, m.b)) / from
  return el.animate(
    [{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(${scale})` }],
    { duration: FLY_MS, delay, easing: EASE, fill: 'forwards' },
  ).finished
}

const waitFor = async (ok: () => boolean, max: number) => {
  const until = performance.now() + max
  while (!ok() && performance.now() < until) await new Promise((r) => setTimeout(r, 50))
  return ok()
}

/** First load of the dashboard. The dark panel is the sidebar before it has a place: every page's shape pops into
 *  a row while the bundle and session load, then the panel folds into the sidebar's spot, each shape flies to its own
 *  nav item, the mark docks in the corner, and the page sheet slides out from under it. */
export function DashIntro({ onDone }: { onDone: () => void }) {
  const [lit, setLit] = useState(0)
  const [word, setWord] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const mark = useRef<HTMLDivElement>(null)
  const shapes = useRef<(HTMLSpanElement | null)[]>([])
  const here = ALL.findIndex((n) => (n.end ? window.location.pathname === n.to || window.location.pathname === `${n.to}/` : window.location.pathname.startsWith(n.to)))

  useEffect(() => {
    const root = document.documentElement
    root.dataset.intro = '1'
    root.dataset.introSheet = '1'
    let alive = true
    const pop = setInterval(() => setLit((l) => Math.min(ALL.length, l + 1)), 70)
    const tick = setInterval(() => setWord((w) => (w + 1) % WORDS.length), 520)
    const finish = () => {
      delete root.dataset.intro
      delete root.dataset.introSheet
      if (alive) onDone()
    }
    const run = async () => {
      const min = new Promise((r) => setTimeout(r, 1250))
      const ready = waitFor(() => !window.location.pathname.startsWith('/app') || (document.querySelectorAll('.d-nav a .d-nav__icon').length >= ALL.length && !!document.querySelector('.d-side')), 7000)
      const [, ok] = await Promise.all([min, ready, document.fonts?.ready])
      // One more frame so the sidebar has settled before it is measured.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      clearInterval(tick)
      if (!alive) return
      setLeaving(true)
      const side = document.querySelector('.d-side')
      const sr = side?.getBoundingClientRect()
      // On phones the sidebar is a hidden drawer, so there is nowhere to fly to.
      if (!ok || !window.location.pathname.startsWith('/app') || !side || !sr || sr.left < 0 || sr.right <= 0 || !panel.current) {
        await panel.current?.parentElement?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' }).finished
        return finish()
      }
      const r = sr
      const bg = getComputedStyle(side).backgroundColor
      const radius = getComputedStyle(side).borderTopLeftRadius
      const icons = document.querySelectorAll('.d-nav a .d-nav__icon')
      const brand = document.querySelector('.d-side__brand svg')
      // The sheet starts sliding out as the panel folds away.
      setTimeout(() => delete root.dataset.introSheet, FLY_MS * 0.55)
      await Promise.all([
        panel.current.animate(
          [{ clipPath: 'inset(0px 0px 0px 0px round 0px)', backgroundColor: bg }, { clipPath: `inset(${r.top}px ${window.innerWidth - r.right}px ${window.innerHeight - r.bottom}px ${r.left}px round ${radius})`, backgroundColor: bg }],
          { duration: FLY_MS, easing: EASE, fill: 'forwards' },
        ).finished,
        flyTo(mark.current, brand, 0),
        ...shapes.current.map((el, i) => flyTo(el, icons[i] ?? null, 40 + Math.abs(i - (here < 0 ? 0 : here)) * 22)),
      ])
      if (!alive) return
      // Everything now sits exactly on top of the real sidebar, so swap in one frame: no fade, no jump.
      delete root.dataset.intro
      if (panel.current.parentElement) panel.current.parentElement.style.display = 'none'
      finish()
    }
    run()
    return () => {
      alive = false
      clearInterval(pop)
      clearInterval(tick)
      delete root.dataset.intro
      delete root.dataset.introSheet
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="dintro" role="progressbar" aria-label="Opening your dashboard" style={{ pointerEvents: leaving ? 'none' : 'auto' }}>
      <div ref={panel} className="dintro__panel" />
      <div className="dintro__stage">
        <div ref={mark} className="dintro__mark">
          <Mark size={30} />
        </div>
        <div className="dintro__row">
          {ALL.map((n, i) => (
            <span key={n.to} ref={(el) => { shapes.current[i] = el }} className={`dintro__shape ${i === here ? 'is-here' : ''}`}>
              <motion.span style={{ display: 'block', lineHeight: 0 }} initial={{ scale: 0, rotate: -40, y: 20 }} animate={leaving ? { scale: 1, rotate: 0, y: 0 } : i < lit ? { scale: i === here ? 1.25 : 1, rotate: 0, y: 0 } : { scale: 0, rotate: -40, y: 20 }} transition={{ type: 'spring', stiffness: 360, damping: 16 }}>
                <Shape kind={n.kind} color={n.color} glyph={n.glyph} size={24} play={false} />
              </motion.span>
            </span>
          ))}
        </div>
        <motion.div className="dintro__words" animate={leaving ? { opacity: 0, y: 12 } : { opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={word} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
              {WORDS[word]}…
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
