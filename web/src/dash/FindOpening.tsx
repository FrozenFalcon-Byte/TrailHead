import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { q, useFetch } from './ui'

/* Find's opening. Find works by climbing down the repository tree a level at a time, so the opening shows that
   tree: columns you can open folder by folder, each one wiped in from the left, with the summary of whatever you
   point at. Beside it hang a few luggage tags, things people lose, that start a search when pulled. */

type Child = { id: string; name: string; kind: string; summary: string }
type Node = { id: string; kind: string; summary: string; children: Child[] }
const EASE = [0.76, 0, 0.24, 1] as const

function Column({ repo, path, open, onOpen, onPoint, depth }: { repo: string; path: string; open: string; onOpen: (c: Child) => void; onPoint: (c: Child | null) => void; depth: number }) {
  const { data } = useFetch<Node>(`/api/tree?path=${encodeURIComponent(path)}&${q(repo)}`)
  const kids = [...(data?.children ?? [])].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  return (
    <motion.ul
      className="fo-col"
      initial={{ clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      exit={{ clipPath: 'inset(0 0 0 100%)', transition: { duration: 0.25, ease: EASE } }}
      transition={{ duration: 0.45, ease: EASE }}
      aria-label={path || 'repository root'}
    >
      {!data && Array.from({ length: 6 }, (_, i) => <li key={i} className="fo-row is-ghost" style={{ width: `${60 + ((i * 17) % 35)}%` }} />)}
      {kids.slice(0, 40).map((c, i) => (
        <motion.li key={c.id} initial={{ x: -10 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30, delay: Math.min(i, 12) * 0.018 }}>
          <button
            type="button"
            className={`fo-row ${c.kind === 'dir' ? 'is-dir' : 'is-file'} ${open === c.id ? 'is-open' : ''}`}
            onClick={() => onOpen(c)}
            onPointerEnter={() => onPoint(c)}
            onFocus={() => onPoint(c)}
            data-depth={depth}
          >
            <i aria-hidden />
            <span className="mono">{c.name}</span>
            {c.kind === 'dir' && <b aria-hidden>›</b>}
          </button>
        </motion.li>
      ))}
    </motion.ul>
  )
}

export function FindOpening({ repo, examples, onPick }: { repo: string; examples: string[]; onPick: (q: string) => void }) {
  const navigate = useNavigate()
  const [trail, setTrail] = useState<string[]>([])
  const [point, setPointNow] = useState<Child | null>(null)
  // settle on what the pointer rests on, not every row it crosses on the way
  const timer = useRef(0)
  const setPoint = (c: Child | null) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPointNow(c), 70)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const open = (depth: number) => (c: Child) => {
    if (c.kind !== 'dir') return navigate(`/app/map?file=${encodeURIComponent(c.id)}`)
    setTrail((t) => [...t.slice(0, depth), c.id])
  }
  const columns = ['', ...trail].slice(-3)
  const offset = trail.length + 1 - columns.length
  return (
    <section className="fo">
      <div className="fo-tree">
        <header className="fo-head">
          <span className="fo-label">The tree Find climbs down</span>
          <nav className="fo-crumbs mono" aria-label="Open folders">
            <button type="button" onClick={() => setTrail([])}>{repo.split('/')[1]}</button>
            {trail.map((t, i) => (
              <motion.span key={t} initial={{ y: -8 }} animate={{ y: 0 }}>
                <i>/</i>
                <button type="button" onClick={() => setTrail(trail.slice(0, i + 1))}>{t.split('/').pop()}</button>
              </motion.span>
            ))}
          </nav>
        </header>
        <div className="fo-cols">
          <AnimatePresence mode="popLayout" initial={false}>
            {columns.map((path, i) => (
              <Column key={path || '/'} repo={repo} path={path} depth={offset + i} open={trail[offset + i] ?? ''} onOpen={open(offset + i)} onPoint={setPoint} />
            ))}
          </AnimatePresence>
        </div>
        <div className="fo-peek">
          {/* one line, replaced in place: an exit animation per hover piles up copies when the pointer moves fast */}
          <motion.p key={point?.id ?? 'none'} initial={{ y: 8, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)' }} transition={{ duration: 0.22, ease: EASE }}>
            {point ? <><b className="mono">{point.id}</b> {point.summary || (point.kind === 'dir' ? 'A folder.' : 'A file.')}</> : 'Point at a folder to read what is inside; click to open it. Find asks the same question at every level, keeping only the likeliest branches.'}
          </motion.p>
        </div>
      </div>
      <div className="fo-tags">
        <span className="fo-label">Lost property</span>
        {examples.map((ex, i) => (
          <motion.button
            key={ex}
            type="button"
            className="fo-tag"
            onClick={() => onPick(ex)}
            data-cursor="Search for it"
            style={{ ['--tilt' as string]: `${i % 2 ? 2.5 : -2.5}deg` }}
            initial={{ rotate: i % 2 ? 24 : -24, y: -30 }}
            animate={{ rotate: i % 2 ? 2.5 : -2.5, y: 0 }}
            whileHover={{ rotate: i % 2 ? -4 : 4, transition: { type: 'spring', stiffness: 260, damping: 6 } }}
            whileTap={{ y: 6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 160, damping: 9, delay: 0.15 + i * 0.1 }}
          >
            <span className="fo-tag__hole" aria-hidden />
            <small className="mono">No. {String(i + 1).padStart(3, '0')}</small>
            <span>{ex}</span>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
