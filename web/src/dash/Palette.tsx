import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../lib/theme'
import { Shape, type Glyph, type ShapeKind } from '../motion/Shapes'
import { useDash } from './context'
import { ALL } from './nav'

/* ⌘K: one box for getting anywhere. Type to filter pages, repositories and engines, or type a question and send
   it straight to Ask, Find or Tour. Arrow keys move, Enter goes, Escape closes. */

type Item = { id: string; group: string; label: string; hint?: string; kind: ShapeKind; color: string; glyph: Glyph; run: () => void }

export function Palette({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [at, setAt] = useState(0)
  const navigate = useNavigate()
  const { repos, repo, setRepo, engine, setEngine, health } = useDash()
  const [theme, setTheme] = useTheme()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('th:palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('th:palette', onOpen)
    }
  }, [])
  useEffect(() => {
    if (open) {
      setText('')
      setAt(0)
      window.setTimeout(() => input.current?.focus(), 20)
    }
  }, [open])

  const close = () => setOpen(false)
  const go = (fn: () => void) => () => {
    close()
    fn()
  }
  const q = text.trim()
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    if (q.length >= 3) {
      const enc = encodeURIComponent(q)
      out.push(
        { id: 'ask', group: 'Send it', label: `Ask: ${q}`, hint: 'cited answer', kind: 'tag', color: 'var(--orange)', glyph: 'signal', run: go(() => navigate(`/app/ask?q=${enc}&run=1`)) },
        { id: 'find', group: 'Send it', label: `Find: ${q}`, hint: 'file and function', kind: 'square', color: 'var(--green)', glyph: 'branch', run: go(() => navigate(`/app/find?q=${enc}&run=1`)) },
        { id: 'tour', group: 'Send it', label: `Tour: ${q}`, hint: 'files in order', kind: 'circle', color: 'var(--blue)', glyph: 'flag', run: go(() => navigate(`/app/tour?q=${enc}&run=1`)) },
      )
    }
    ALL.forEach((n) => out.push({ id: `go:${n.to}`, group: 'Go to', label: n.label, hint: `g ${n.key}`, kind: n.kind, color: n.color, glyph: n.glyph, run: go(() => navigate(n.to)) }))
    repos.filter((r) => r.status === 'ready' && r.repo !== repo).forEach((r) => out.push({ id: `repo:${r.repo}`, group: 'Switch repository', label: r.repo, hint: `${(r.files ?? 0).toLocaleString()} files`, kind: 'circle', color: 'var(--violet)', glyph: 'folder', run: go(() => setRepo(r.repo)) }))
    ;(health?.engines ?? []).filter((e) => e !== engine).forEach((e) => out.push({ id: `engine:${e}`, group: 'Switch engine', label: `Use ${e === 'llm' ? 'LLM fallback' : e === 'jev' ? 'Jev' : e}`, kind: 'square', color: 'var(--yellow)', glyph: 'check', run: go(() => setEngine(e)) }))
    out.push(
      { id: 'theme', group: 'Do', label: theme === 'dark' ? 'Switch to light' : 'Switch to dark', kind: 'circle', color: 'var(--yellow)', glyph: 'flag', run: go(() => setTheme(theme === 'dark' ? 'light' : 'dark')) },
      { id: 'refresh', group: 'Do', label: 'Refresh this page', hint: 'r', kind: 'square', color: 'var(--blue)', glyph: 'grep', run: go(() => window.dispatchEvent(new CustomEvent('th:refresh'))) },
      { id: 'out', group: 'Do', label: 'Sign out', kind: 'tag', color: 'var(--orange)', glyph: 'signal', run: go(onSignOut) },
    )
    if (!q) return out.filter((i) => i.group !== 'Send it')
    const words = q.toLowerCase().split(/\s+/)
    const matching = out.filter((i) => i.group === 'Send it' || words.every((w) => `${i.group} ${i.label}`.toLowerCase().includes(w)))
    // a phrase that names a page or repo puts that first; a sentence leads with sending it
    const named = matching.filter((i) => i.group !== 'Send it')
    return named.length && q.split(/\s+/).length <= 2 ? [...named, ...matching.filter((i) => i.group === 'Send it')] : matching
  }, [q, repos, repo, engine, health, theme])

  useEffect(() => setAt(0), [q])
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAt((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAt((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      items[at]?.run()
    }
  }

  let lastGroup = ''
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="pal-wrap" onPointerDown={(e) => e.target === e.currentTarget && close()} initial={{ backgroundColor: 'rgba(23,22,27,0)' }} animate={{ backgroundColor: 'rgba(23,22,27,0.38)' }} exit={{ backgroundColor: 'rgba(23,22,27,0)' }} transition={{ duration: 0.2 }}>
          <motion.div className="pal" role="dialog" aria-label="Command palette" initial={{ y: -24, scale: 0.96, clipPath: 'inset(0 0 100% 0 round 22px)' }} animate={{ y: 0, scale: 1, clipPath: 'inset(0 0 0% 0 round 22px)' }} exit={{ y: -16, scale: 0.97, clipPath: 'inset(0 0 100% 0 round 22px)' }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
            <div className="pal-field">
              <span className="pal-key mono" aria-hidden>⌘K</span>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="Go somewhere, switch repository, or type a question" aria-label="Command" aria-activedescendant={items[at] ? `pal-${items[at].id}` : undefined} />
            </div>
            <ol className="pal-list" ref={list} role="listbox">
              {items.length === 0 && <li className="pal-none">Nothing by that name. Type three letters or more to ask it instead.</li>}
              {items.map((it, i) => {
                const head = it.group !== lastGroup
                lastGroup = it.group
                return (
                  <li key={it.id}>
                    {head && <span className="pal-group">{it.group}</span>}
                    <button id={`pal-${it.id}`} data-i={i} role="option" aria-selected={i === at} className={`pal-item ${i === at ? 'is-on' : ''}`} onPointerMove={() => setAt(i)} onClick={it.run}>
                      {i === at && <motion.span layoutId="pal-ink" className="pal-ink" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />}
                      <Shape kind={it.kind} color={it.color} glyph={it.glyph} size={24} play={false} />
                      <span className="pal-label">{it.label}</span>
                      {it.hint && <small className="mono">{it.hint}</small>}
                    </button>
                  </li>
                )
              })}
            </ol>
            <footer className="pal-foot mono"><span>↑↓ move</span><span>↵ go</span><span>esc close</span></footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
