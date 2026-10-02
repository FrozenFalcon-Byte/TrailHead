import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { makeQr } from '../lib/qr'
import { Wordmark } from '../motion/Mark'
import { Shape } from '../motion/Shapes'
import { CHAPTERS } from './chapters'

/* The guide's sidebar, built like the dashboard's: a dark rounded column with grouped links, a Shape icon for each
   chapter and a lime pill that slides to the chapter you are reading. Below the links sits a QR code that always
   points at the current chapter, so you can carry the page you're on over to your phone. */

const GROUPS = [...new Set(CHAPTERS.map((c) => c.group))]

export function Side({ active, onJump }: { active: number; onJump: (i: number) => void }) {
  const here = CHAPTERS[active]
  return (
    <aside className="fg-side">
      <div className="fg-side__top">
        <Link to="/" className="fg-side__brand" aria-label="Trailhead home"><Wordmark /></Link>
      </div>
      <p className="fg-side__title">Field guide</p>
      <nav className="fg-nav" aria-label="Guide chapters">
        {GROUPS.map((g) => (
          <div key={g} className="fg-nav__set">
            <span className="fg-nav__group">{g}</span>
            {CHAPTERS.map((c, i) => c.group !== g ? null : (
              <a key={c.id} href={`#${c.id}`} className={i === active ? 'active' : ''} aria-current={i === active ? 'location' : undefined}
                onClick={(e) => { e.preventDefault(); onJump(i) }}>
                {i === active && <motion.span layoutId="fg-nav-pill" className="fg-nav__pill" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                <motion.span className="fg-nav__icon" animate={{ rotate: i === active ? -8 : 0, scale: i === active ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 320, damping: 16 }}>
                  <Shape kind={c.kind} color={c.color} glyph={c.glyph} size={22} play={i === active} />
                </motion.span>
                <span className="fg-nav__label">{c.label}</span>
                {i === active && <motion.span layoutId="fg-nav-arrow" className="fg-nav__arrow">→</motion.span>}
              </a>
            ))}
          </div>
        ))}
      </nav>
      <div className="fg-carry">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={here.id} className="fg-carry__in"
            initial={{ rotateX: -80 }} animate={{ rotateX: 0, transition: { type: 'spring', stiffness: 170, damping: 18 } }} exit={{ rotateX: 80, transition: { duration: 0.15 } }}
            style={{ transformOrigin: 'top center' }}>
            <Qr text={`${location.origin}/guide#${here.id}`} />
            <div>
              <small>You are at</small>
              <b>{here.where}</b>
              <span>Scan to open this stop on your phone.</span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <Link to="/app" className="fg-side__app">Open the app <span aria-hidden>→</span></Link>
    </aside>
  )
}

function Qr({ text }: { text: string }) {
  const m = useMemo(() => makeQr(text, 'M'), [text])
  const cells: string[] = []
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) cells.push(`M${c} ${r}h1v1h-1z`)
  return (
    <svg className="fg-carry__qr" viewBox={`-2 -2 ${m.size + 4} ${m.size + 4}`} role="img" aria-label="QR code for this chapter">
      <rect x={-2} y={-2} width={m.size + 4} height={m.size + 4} rx={3} fill="#fff" />
      <path d={cells.join('')} fill="#17161b" shapeRendering="crispEdges" />
    </svg>
  )
}
