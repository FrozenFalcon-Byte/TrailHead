import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { notify } from '../lib/toast'
import { useWrap, WRAP_GLYPH } from '../lib/wrap'

/* "The code behind it": the definitions the answer rests on, read from the checkout at the ingested commit. A tab
   per file, the block itself with real line numbers, a light highlighter, and links to the map and to GitHub at
   that exact commit and range. Code is only shown, never run. */

export type Snippet = { path: string; lang: string; symbol: string; kind: string; start: number; end: number; full_end: number; code: string; url: string }

const FOLD = 18

const KEYWORDS = new Set(
  ('and as assert async await break case class const continue def default del elif else enum except export extends false False finally for from func function go if import in interface is lambda let match new nil none None nonlocal not null or package pass private protected public raise return self static struct super switch this throw true True try type typeof var void while with yield').split(' '),
)
// one pass over the whole block, so strings and comments that span lines stay coloured
const TOKEN = /("""[\s\S]*?"""|'''[\s\S]*?'''|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[^\n]*|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(@[A-Za-z_][\w.]*)|\b(\d[\d_]*(?:\.\d+)?)\b|([A-Za-z_]\w*)/g

export type Tok = { t: string; c?: string }

export function highlight(code: string, lang: string): Tok[][] {
  const hashComments = !/^(javascript|typescript|tsx|jsx|go|rust|java|c|cpp|csharp)$/i.test(lang)
  const toks: Tok[] = []
  let at = 0
  let prev = ''
  for (const m of code.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > at) toks.push({ t: code.slice(at, i) })
    const [all, str, com, deco, num, word] = m
    if (str) toks.push({ t: all, c: 'str' })
    else if (com) toks.push(com.startsWith('#') && !hashComments ? { t: all } : { t: all, c: 'com' })
    else if (deco) toks.push({ t: all, c: 'deco' })
    else if (num) toks.push({ t: all, c: 'num' })
    else if (word) toks.push({ t: all, c: KEYWORDS.has(word) ? 'kw' : /^(def|class|function|func|fn|interface|struct)$/.test(prev) ? 'name' : /^[A-Z]/.test(word) ? 'type' : undefined })
    if (word) prev = word
    at = i + all.length
  }
  if (at < code.length) toks.push({ t: code.slice(at) })
  const lines: Tok[][] = [[]]
  for (const tok of toks) {
    tok.t.split('\n').forEach((part, k) => {
      if (k > 0) lines.push([])
      if (part) lines[lines.length - 1].push({ t: part, c: tok.c })
    })
  }
  return lines
}

const base = (p: string) => p.split('/').pop() ?? p

/** 0-based first and last line of a docstring right under the signature, when it runs long enough to fold. */
function docSpan(code: string): [number, number] | null {
  const lines = code.split('\n')
  for (let i = 1; i < Math.min(lines.length, 12); i++) {
    const t = lines[i].trim()
    const q = t.match(/^r?("{3}|'{3})/)?.[1]
    if (!q) continue
    if (t.split(q).length > 2) return null
    const j = lines.findIndex((l, k) => k > i && l.includes(q))
    return j - i >= 4 ? [i, j] : null
  }
  return null
}

type Row = { kind: 'line'; i: number } | { kind: 'fold'; count: number }

export function CodeRefs({ snippets }: { snippets: Snippet[] }) {
  const [pick, setPick] = useState(0)
  const [open, setOpen] = useState(false)
  const [docOpen, setDocOpen] = useState(false)
  const [wrap, toggleWrap] = useWrap()
  const s = snippets[Math.min(pick, snippets.length - 1)]
  const lines = useMemo(() => (s ? highlight(s.code, s.lang) : []), [s])
  const doc = useMemo(() => (s ? docSpan(s.code) : null), [s])
  if (!s) return null
  const rows: Row[] = []
  lines.forEach((_, i) => {
    if (doc && !docOpen && i > doc[0] && i <= doc[1]) {
      if (i === doc[0] + 1) rows.push({ kind: 'fold', count: doc[1] - doc[0] })
      return
    }
    rows.push({ kind: 'line', i })
  })
  const long = rows.length > FOLD
  const shown = open || !long ? rows : rows.slice(0, FOLD)
  const copy = () => navigator.clipboard?.writeText(s.code).then(() => notify.ok('Code copied', `${s.path}, lines ${s.start}–${s.end}`), () => undefined)

  return (
    <section className="cr" aria-label="The code behind the answer">
      <div className="cr-head">
        <h3 className="chunk">The code behind it</h3>
        <span className="d-muted small">Read at the ingested commit, never run</span>
      </div>
      {snippets.length > 1 && (
        <div className="cr-tabs" role="tablist">
          {snippets.map((x, i) => (
            <button key={x.path} role="tab" aria-selected={i === pick} className={i === pick ? 'is-on' : ''} onClick={() => { setPick(i); setOpen(false); setDocOpen(false) }}>
              {i === pick && <motion.span layoutId="cr-tab" className="cr-tabs__pill" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
              <span className="mono">{base(x.path)}</span>
              {x.symbol && <small>{x.symbol.split('.').pop()}</small>}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.figure key={s.path} className="cr-block" initial={{ y: 12, rotateX: -6 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -8, rotateX: 4, transition: { duration: 0.12 } }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
          <figcaption className="cr-bar">
            <Link to={`/app/map?file=${encodeURIComponent(s.path)}&lines=${s.start}-${s.end}`} className="cr-path mono" data-path={s.path} data-cursor="Show on the map">{s.path}</Link>
            {s.symbol && <span className="cr-sym mono">{s.symbol}</span>}
            <span className="cr-lines">lines {s.start}–{s.end}{s.full_end > s.end ? ` · the definition runs to ${s.full_end}` : ''}</span>
            <span className="cr-acts">
              <WrapButton on={wrap} onClick={toggleWrap} />
              <button onClick={copy} data-cursor="Copy the code">Copy</button>
              {s.url && <a href={s.url} target="_blank" rel="noreferrer noopener" data-cursor="Open at this commit">GitHub ↗</a>}
            </span>
          </figcaption>
          <motion.pre className={`cr-code ${wrap ? 'is-wrap' : ''}`} layout="size" transition={{ type: 'spring', stiffness: 260, damping: 30 }}>
            <code>
              {shown.map((row) =>
                row.kind === 'fold' ? (
                  <button key="fold" className="cr-line cr-fold" onClick={() => setDocOpen(true)} data-cursor="Show the docstring">
                    <span className="cr-n" aria-hidden>⋯</span>
                    <span className="cr-t">{row.count} more docstring lines</span>
                  </button>
                ) : (
                  <span key={row.i} className="cr-line">
                    <span className="cr-n" aria-hidden>{s.start + row.i}</span>
                    <span className="cr-t">{lines[row.i].length ? lines[row.i].map((t, k) => (t.c ? <span key={k} className={`tk-${t.c}`}>{t.t}</span> : t.t)) : ' '}</span>
                  </span>
                ),
              )}
            </code>
          </motion.pre>
          {long && (
            <button className="cr-more" onClick={() => setOpen((o) => !o)}>
              {open ? 'Show less' : `Show all ${rows.length} lines`}
            </button>
          )}
        </motion.figure>
      </AnimatePresence>
    </section>
  )
}

/** Wrap long lines or let them run; the same switch for every code block on the site. */
export function WrapButton({ on, onClick, className = '' }: { on: boolean; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`cr-wrap ${on ? 'is-on' : ''} ${className}`} onClick={onClick} aria-pressed={on} data-cursor={on ? 'Let long lines run' : 'Wrap long lines'}>
      <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden>
        <path d={WRAP_GLYPH(on)} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Wrap
    </button>
  )
}
