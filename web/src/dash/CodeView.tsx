import { motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { notify } from '../lib/toast'
import { useWrap } from '../lib/wrap'
import { highlight, WrapButton } from './CodeRefs'
import { q } from './ui'

/* The file itself, under the map: read from the checkout at the ingested commit (or from GitHub at that same
   commit when the server's copy is gone), with an outline of its definitions that jumps to and lights up each one.
   Clicking a line number picks it, shift-click picks a range, and the GitHub link follows whatever is picked.
   The text is only ever shown, never run. */

type Sym = { name: string; kind: string; signature: string; doc: string; start: number; end: number }
type FileView = { path: string; lang: string; loc: number; size: number; is_test: boolean; header: string; repo: string; head: string; url: string; raw: string; code: string | null; too_big: boolean; symbols: Sym[] }

const FIRST = 400
const KIND_MARK: Record<string, string> = { class: 'C', function: 'ƒ', method: 'm' }

const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export function CodeView({ repo, path, lines: wanted }: { repo: string; path: string; lines?: [number, number] | null }) {
  const [view, setView] = useState<FileView | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [problem, setProblem] = useState('')
  const [all, setAll] = useState(false)
  const [range, setRange] = useState<[number, number] | null>(wanted ?? null)
  const [filter, setFilter] = useState('')
  const [wrap, toggleWrap] = useWrap()
  const box = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let alive = true
    setView(null)
    setCode(null)
    setProblem('')
    api<FileView>(`/api/file?path=${encodeURIComponent(path)}&${q(repo)}`)
      .then(async (v) => {
        if (!alive) return
        setView(v)
        if (v.code !== null) return setCode(v.code)
        if (v.too_big || !v.raw) return setProblem(v.too_big ? `At ${bytes(v.size)} this file is too big to show here.` : 'The server no longer has this file.')
        // the server's checkout is gone (a restart): read the same commit from GitHub, straight into the page
        const res = await fetch(v.raw)
        const text = res.ok ? await res.text() : ''
        if (!alive) return
        if (!res.ok) setProblem(`GitHub answered ${res.status} for this file.`)
        else if (text.slice(0, 8000).includes('\0')) setProblem('This is a binary file, so there is no text to show.')
        else setCode(text)
      })
      .catch((e) => alive && setProblem(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [repo, path])

  const lines = useMemo(() => (code === null ? [] : highlight(code.replace(/\n$/, ''), view?.lang ?? '')), [code, view?.lang])
  const shown = all || lines.length <= FIRST + 80 ? lines.length : FIRST
  const syms = useMemo(() => {
    const list = view?.symbols ?? []
    const f = filter.trim().toLowerCase()
    return f ? list.filter((s) => s.name.toLowerCase().includes(f)) : list
  }, [view, filter])

  // bring a picked range into view inside the block, opening the rest of a long file when it sits past the fold
  const jump = (r: [number, number]) => {
    setRange(r)
    if (r[0] > FIRST) setAll(true)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = box.current?.querySelector<HTMLElement>(`[data-ln="${r[0]}"]`)
      if (el && box.current) box.current.scrollTo({ top: el.offsetTop - 48, behavior: 'smooth' })
    }))
  }
  const jumped = useRef(false)
  useEffect(() => {
    if (!wanted || !lines.length || jumped.current) return
    jumped.current = true
    jump(wanted)
  }, [wanted, lines.length])

  const pickLine = (n: number, extend: boolean) => setRange((r) => (extend && r ? [Math.min(r[0], n), Math.max(r[1], n)] : r && r[0] === n && r[1] === n ? null : [n, n]))
  const link = view?.url ? view.url + (range ? (range[0] === range[1] ? `#L${range[0]}` : `#L${range[0]}-L${range[1]}`) : '') : ''
  const copy = () => {
    if (code === null) return
    const text = range ? code.split('\n').slice(range[0] - 1, range[1]).join('\n') : code
    navigator.clipboard?.writeText(text).then(() => notify.ok(range ? 'Lines copied' : 'File copied', range ? `${path}, lines ${range[0]}–${range[1]}` : path), () => undefined)
  }
  const inside = (n: number) => !!range && n >= range[0] && n <= range[1]

  return (
    <motion.section id="m-code" className="cv" initial={{ y: 24, rotateX: -5 }} animate={{ y: 0, rotateX: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }} aria-label={`The code in ${path}`}>
      <header className="cv-bar">
        <span className="cv-path mono">{path}</span>
        {view && <span className="cv-meta">{[view.lang, `${view.loc.toLocaleString()} lines`, bytes(view.size), view.is_test ? 'test' : ''].filter(Boolean).join(' · ')}</span>}
        <span className="cr-acts">
          <WrapButton on={wrap} onClick={toggleWrap} />
          <button onClick={copy} disabled={code === null} data-cursor={range ? 'Copy the picked lines' : 'Copy the whole file'}>{range ? 'Copy lines' : 'Copy'}</button>
          {link && <a href={link} target="_blank" rel="noreferrer noopener" data-cursor={range ? 'Open these lines at this commit' : 'Open at this commit'}>GitHub ↗</a>}
        </span>
      </header>

      {view && view.symbols.length > 0 && (
        <div className="cv-outline">
          {view.symbols.length > 8 && <input className="cv-find mono" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`${view.symbols.length} definitions`} aria-label="Filter definitions" />}
          <div className="cv-syms">
            {syms.map((s) => (
              <button key={`${s.name}:${s.start}`} className={`cv-sym is-${s.kind} ${range && range[0] === s.start && range[1] === s.end ? 'is-on' : ''}`} onClick={() => jump([s.start, s.end])} data-cursor={s.doc || s.signature}>
                <i aria-hidden>{KIND_MARK[s.kind] ?? '·'}</i>
                <span className="mono">{s.name}</span>
                <small>{s.start}</small>
              </button>
            ))}
            {syms.length === 0 && <span className="cv-none">Nothing called “{filter}”.</span>}
          </div>
        </div>
      )}

      {problem ? (
        <div className="cv-empty">
          <p>{problem}</p>
          {view?.url && <a className="btn small" href={view.url} target="_blank" rel="noreferrer noopener"><span>Read it on GitHub</span><span className="arrow">↗</span></a>}
        </div>
      ) : code === null ? (
        <div className="cv-loading" aria-label="Reading the file">
          {[72, 54, 88, 40, 66].map((w, i) => <motion.span key={i} style={{ width: `${w}%` }} animate={{ opacity: [0.35, 0.8, 0.35] }} transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.1 }} />)}
        </div>
      ) : (
        <>
          <pre ref={box} className={`cr-code cv-code ${wrap ? 'is-wrap' : ''}`}>
            <code>
              {lines.slice(0, shown).map((ln, i) => {
                const n = i + 1
                return (
                  <span key={n} className={`cr-line ${inside(n) ? 'is-picked' : ''} ${range && n === range[0] ? 'is-first' : ''}`} data-ln={n}>
                    <button className="cr-n cv-n" onClick={(e) => pickLine(n, e.shiftKey)} tabIndex={-1} aria-label={`Pick line ${n}`}>{n}</button>
                    <span className="cr-t">{ln.length ? ln.map((t, k) => (t.c ? <span key={k} className={`tk-${t.c}`}>{t.t}</span> : t.t)) : ' '}</span>
                  </span>
                )
              })}
            </code>
          </pre>
          {shown < lines.length && <button className="cr-more" onClick={() => setAll(true)}>Show the other {(lines.length - shown).toLocaleString()} lines</button>}
          <p className="cv-tip">Click a line number to pick it, shift-click to pick a range; Copy and GitHub follow what is picked.</p>
        </>
      )}
    </motion.section>
  )
}
