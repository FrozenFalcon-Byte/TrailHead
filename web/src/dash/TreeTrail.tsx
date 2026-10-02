import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'

/* The top of the repository as a real tree: a trunk drawn from the repo root, one branch per top-level folder.
   Each branch shows what the folder holds as chips instead of a run-on sentence, and opens to the full summary. */

type Dir = { path: string; summary: string }
const LOOKS: { kind: ShapeKind; color: string; bg: string; glyph: Glyph }[] = [
  { kind: 'circle', color: 'var(--green)', bg: 'var(--mint)', glyph: 'pine' },
  { kind: 'square', color: 'var(--blue)', bg: 'var(--sky)', glyph: 'folder' },
  { kind: 'tag', color: 'var(--orange)', bg: 'var(--peach)', glyph: 'file' },
  { kind: 'circle', color: 'var(--violet)', bg: 'var(--lilac)', glyph: 'branch' },
  { kind: 'square', color: 'var(--yellow)', bg: 'var(--butter)', glyph: 'pr' },
  { kind: 'tag', color: 'var(--lime)', bg: 'var(--limeade)', glyph: 'flag' },
]

/** "Scrapy, a crawler. Contains a/, b/, c.py" → the description and the list of children. */
function split(summary: string): { text: string; kids: string[] } {
  const m = summary.match(/^(.*?)(?:\.\s*)?Contains\s+(.+)$/s)
  if (!m) return { text: summary, kids: [] }
  const kids = m[2].replace(/[.…]+$/, '').split(/,\s*/).map((k) => k.replace(/\s+and \d+ more$/i, '').trim()).filter((k) => k && !/^and \d+ more$/i.test(k))
  return { text: m[1].trim(), kids }
}

export function TreeTrail({ dirs, repo }: { dirs: Dir[]; repo: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const root = dirs.find((d) => d.path === '' || d.path === '/' || d.path === '.')
  const branches = dirs.filter((d) => d !== root).slice(0, 6)
  const rootInfo = split(root?.summary ?? '')
  return (
    <div className="tr">
      <div className="tr-root">
        <span className="tr-root__seed" aria-hidden>
          <Shape kind="square" color="var(--lime)" glyph="pine" size={30} play={false} />
        </span>
        <div>
          <b className="mono">{repo || 'repository'}</b>
          <span>{rootInfo.text || `${branches.length} folders at the top`}</span>
        </div>
      </div>
      <ol className="tr-list">
        {branches.map((d, i) => {
          const look = LOOKS[i % LOOKS.length]
          const { text, kids } = split(d.summary || '')
          const isOpen = open === d.path
          return (
            <motion.li key={d.path} className={`tr-node ${isOpen ? 'is-open' : ''}`} style={{ ['--tint' as string]: look.bg, ['--ink-c' as string]: look.color }} layout transition={{ type: 'spring', stiffness: 320, damping: 30 }}>
              <svg className="tr-node__branch" width={34} height={40} viewBox="0 0 34 40" aria-hidden>
                <motion.path d="M2 0 V14 Q2 26 14 26 H34" fill="none" stroke="var(--line-strong, var(--line))" strokeWidth={2.5} strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.08 }} />
              </svg>
              <button className="tr-node__head" onClick={() => setOpen(isOpen ? null : d.path)} aria-expanded={isOpen} data-cursor={isOpen ? 'Fold it' : 'What is in here'}>
                <motion.span className="tr-node__icon" animate={{ rotate: isOpen ? -12 : 0, scale: isOpen ? 1.12 : 1 }} transition={{ type: 'spring', stiffness: 400, damping: 16 }}>
                  <Shape kind={look.kind} color={look.color} glyph={look.glyph} size={30} play={isOpen} />
                </motion.span>
                <span className="tr-node__name mono">{d.path.replace(/\/$/, '')}/</span>
                <span className="tr-node__kids">
                  {(kids.length ? kids : [text]).slice(0, isOpen ? 0 : 3).map((k) => <i key={k}>{k}</i>)}
                  {!isOpen && kids.length > 3 && <i className="is-more">+{kids.length - 3}</i>}
                </span>
                <motion.svg className="tr-node__chev" width={14} height={14} viewBox="0 0 14 14" animate={{ rotate: isOpen ? 90 : 0 }} aria-hidden><path d="M5 3l4 4-4 4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></motion.svg>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div className="tr-node__body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="tr-node__inner">
                      {text && <p>{text}</p>}
                      {kids.length > 0 && (
                        <div className="tr-node__all">
                          {kids.map((k, j) => (
                            <motion.span key={k} className={k.endsWith('/') ? 'is-dir' : ''} initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: 0.05 + j * 0.025 }}>
                              {k}
                            </motion.span>
                          ))}
                        </div>
                      )}
                      <Link to={`/app/map?path=${encodeURIComponent(d.path)}`} className="d-more">Open it on the map →</Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
