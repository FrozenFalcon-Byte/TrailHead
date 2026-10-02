import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { registeredGroups, type CtxGroup, type CtxItem } from '../lib/ctx'
import { getPrefs, setPrefs, usePref } from '../lib/prefs'
import { openQr } from '../lib/qr'
import { useTheme } from '../lib/theme'
import { notify } from '../lib/toast'
import { useSignedIn } from '../lib/auth'

/* Trailhead's own right-click menu. What it offers depends on what is under the pointer: selected text can be
   asked about or searched for in the code, a file path can be opened on the map or start a tour, a link can be
   copied or turned into a QR code, a text field gets cut/copy/paste, and components add their own entries
   (a repository tile, a saved tour). The page-level entries follow where you are. Shift + right-click still
   opens the browser's menu. */

const EASE = [0.22, 1, 0.36, 1] as const
const DASH: [string, string][] = [
  ['Overview', '/app'], ['Ask', '/app/ask'], ['Tour', '/app/tour'], ['Find', '/app/find'], ['First issues', '/app/issues'],
  ['Map', '/app/map'], ['Decisions', '/app/decisions'], ['Evals', '/app/evals'], ['Repositories', '/app/repos'], ['Profile', '/app/profile'], ['Settings', '/app/settings'],
]
const LANDING: [string, string][] = [['The story', 'story'], ['How it works', 'how'], ['Receipts', 'receipts'], ['Questions', 'faq'], ['Back to the top', 'top']]

const short = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(
    () => notify.ok(`${what} copied`, short(text, 60)),
    () => notify.error('Could not copy', 'The browser blocked clipboard access.'),
  )

type Built = { groups: CtxGroup[] }
type Pos = { x: number; y: number }

function useBuild() {
  const navigate = useNavigate()
  const location = useLocation()
  const [theme, setTheme] = useTheme()
  const signedIn = useSignedIn()
  return useCallback(
    (target: Element, selection: string): Built => {
      const groups: CtxGroup[] = [...registeredGroups(target)]
      const go = (to: string) => () => navigate(to)

      const pathEl = target.closest<HTMLElement>('[data-path]')
      if (pathEl?.dataset.path) {
        const p = pathEl.dataset.path
        groups.push({
          title: short(p, 34),
          items: [
            { label: 'Copy path', icon: '⧉', run: () => copy(p, 'Path') },
            { label: 'Show on the map', icon: '◈', run: go(`/app/map?file=${encodeURIComponent(p)}`), disabled: !signedIn },
            { label: 'Plan a tour from this file', icon: '⚑', run: go(`/app/tour?q=${encodeURIComponent(`Help me understand ${p} and what I should read before changing it.`)}`), disabled: !signedIn },
            { label: 'Ask what it does', icon: '?', run: go(`/app/ask?q=${encodeURIComponent(`How does ${p} work?`)}`), disabled: !signedIn },
          ],
        })
      }

      const field = target.closest<HTMLInputElement | HTMLTextAreaElement>('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea')
      if (field && !field.readOnly) {
        const picked = field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0)
        const act = (cmd: string, value?: string) => () => {
          field.focus()
          document.execCommand(cmd, false, value)
        }
        groups.push({
          title: 'Text field',
          items: [
            { label: 'Cut', icon: '✂', hint: '⌘X', disabled: !picked, run: () => { navigator.clipboard.writeText(picked).then(act('delete')) } },
            { label: 'Copy', icon: '⧉', hint: '⌘C', disabled: !picked, run: () => copy(picked, 'Text') },
            { label: 'Paste', icon: '⎘', hint: '⌘V', run: () => navigator.clipboard.readText().then((t) => act('insertText', t)(), () => notify.info('Paste with ⌘V', 'The browser only lets pages read the clipboard after you allow it.')) },
            { label: 'Select all', icon: '▣', hint: '⌘A', run: () => { field.focus(); field.select() } },
            { label: 'Clear', icon: '⌫', disabled: !field.value, run: () => { field.focus(); field.select(); document.execCommand('delete') } },
          ],
        })
      } else if (selection) {
        groups.push({
          title: `“${short(selection, 26)}”`,
          items: [
            { label: 'Copy', icon: '⧉', hint: '⌘C', run: () => copy(selection, 'Text') },
            { label: 'Ask Trailhead about this', icon: '?', run: go(`/app/ask?q=${encodeURIComponent(selection.slice(0, 480))}`), disabled: !signedIn },
            { label: 'Find it in the code', icon: '⌕', run: go(`/app/find?q=${encodeURIComponent(`Where is ${selection.slice(0, 200)}?`)}`), disabled: !signedIn },
          ],
        })
      }

      const link = target.closest<HTMLAnchorElement>('a[href]')
      if (link) {
        const url = new URL(link.href, window.location.href)
        const inside = url.origin === window.location.origin
        groups.push({
          title: inside ? 'Link' : short(url.host, 30),
          items: [
            { label: inside ? 'Open' : 'Open in a new tab', icon: '↗', run: () => (inside ? navigate(url.pathname + url.search + url.hash) : window.open(url.href, '_blank', 'noopener,noreferrer')) },
            ...(inside ? [{ label: 'Open in a new tab', icon: '⧉', run: () => window.open(url.href, '_blank', 'noopener') }] : []),
            { label: 'Copy link address', icon: '⛓', run: () => copy(url.href, 'Link') },
            { label: 'Show as QR code', icon: '▦', run: () => openQr({ title: link.textContent?.trim().slice(0, 60) || url.host, url: url.href }) },
          ],
        })
      }

      const img = target.closest('img')
      if (img?.src && !img.src.startsWith('data:')) groups.push({ title: 'Image', items: [{ label: 'Copy image address', icon: '⛓', run: () => copy(img.src, 'Image address') }, { label: 'Open image in a new tab', icon: '↗', run: () => window.open(img.src, '_blank', 'noopener') }] })

      const area = location.pathname.split('/')[1]
      if (area === '') groups.push({ title: 'This page', items: [{ label: 'Jump to', icon: '↧', children: LANDING.map(([label, id]) => ({ label, run: () => window.dispatchEvent(new CustomEvent('th:jump', { detail: id })) })) }, signedIn ? { label: 'Open the dashboard', icon: '→', run: go('/app') } : { label: 'Log in', icon: '→', run: go('/login') }] })
      if (area === 'app')
        groups.push({
          title: 'Dashboard',
          items: [
            { label: 'Go to', icon: '↦', children: DASH.filter(([, to]) => to !== location.pathname).map(([label, to]) => ({ label, run: go(to) })) },
            { label: 'Refresh this page', icon: '↻', hint: 'R', run: () => window.dispatchEvent(new CustomEvent('th:refresh')) },
            { label: 'Settings', icon: '⚙', hint: ',', run: go('/app/settings') },
          ],
        })
      groups.push({
        items: [
          { label: 'Back', icon: '←', run: () => navigate(-1) },
          { label: theme === 'dark' ? 'Switch to light' : 'Switch to dark', icon: theme === 'dark' ? '☀' : '☾', run: () => setTheme(theme === 'dark' ? 'light' : 'dark') },
          { label: getPrefs().cardHover ? 'Turn off card hover motion' : 'Turn on card hover motion', icon: '◇', run: () => { const on = !getPrefs().cardHover; setPrefs({ cardHover: on }); notify.ok(on ? 'Card hover motion on' : 'Card hover motion off', on ? 'Cards lift and tilt under the pointer again.' : 'Cards stay still and just outline. Turn it back on here or in Settings.') } },
          { label: 'Copy page link', icon: '⛓', run: () => copy(window.location.href, 'Page link') },
          { label: 'QR code for this page', icon: '▦', run: () => openQr({ title: document.title.split('—')[0].trim() || 'This page', url: window.location.href }) },
          { label: 'Reload', icon: '⟳', hint: '⌘R', run: () => window.location.reload() },
        ],
      })
      return { groups: groups.filter((g) => g.items.length) }
    },
    [navigate, location.pathname, theme, setTheme, signedIn],
  )
}

function Menu({ built, pos, onClose, depth = 0 }: { built: Built; pos: Pos; onClose: () => void; depth?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(pos)
  const [hi, setHi] = useState(-1)
  const [sub, setSub] = useState<{ i: number; pos: Pos } | null>(null)
  const flat = built.groups.flatMap((g) => g.items)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    setAt({ x: Math.max(8, Math.min(pos.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(pos.y, window.innerHeight - h - 8)) })
    if (depth === 0) el.focus()
  }, [pos.x, pos.y, depth])

  const openSub = (i: number) => {
    const row = ref.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)
    const r = row?.getBoundingClientRect()
    if (!r) return
    const right = r.right + 230 < window.innerWidth
    setSub({ i, pos: { x: right ? r.right + 4 : r.left - 234, y: r.top - 6 } })
  }
  const run = (item: CtxItem, i: number) => {
    if (item.disabled) return
    if (item.children) return openSub(i)
    onClose()
    item.run?.()
  }
  const onKey = (e: React.KeyboardEvent) => {
    if (sub && depth === 0 && e.key !== 'Escape' && e.key !== 'ArrowLeft') return
    const enabled = flat.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0)
    const k = enabled.indexOf(hi)
    if (e.key === 'ArrowDown') setHi(enabled[(k + 1) % enabled.length])
    else if (e.key === 'ArrowUp') setHi(enabled[(k - 1 + enabled.length) % enabled.length])
    else if (e.key === 'Enter' || e.key === ' ') flat[hi] && run(flat[hi], hi)
    else if (e.key === 'ArrowRight') flat[hi]?.children && openSub(hi)
    else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      if (sub) setSub(null)
      else onClose()
    } else return
    e.preventDefault()
    e.stopPropagation()
  }

  let i = -1
  return (
    <>
      <motion.div
        ref={ref}
        className="cm"
        role="menu"
        tabIndex={-1}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
        style={{ left: at.x, top: at.y, transformOrigin: `${pos.x <= at.x ? 0 : 100}% ${pos.y <= at.y ? 0 : 100}%` }}
        initial={{ opacity: 0, scale: 0.86, rotate: depth ? 0 : -2 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.14 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        onPointerLeave={() => !sub && setHi(-1)}
      >
        {built.groups.map((g, gi) => (
          <div key={gi} className="cm__group">
            {g.title && <div className="cm__title">{g.title}</div>}
            {g.items.map((item) => {
              i += 1
              const idx = i
              return (
                <motion.div
                  key={idx}
                  data-i={idx}
                  role="menuitem"
                  aria-disabled={item.disabled}
                  aria-haspopup={item.children ? 'menu' : undefined}
                  className={`cm__item ${item.disabled ? 'is-off' : ''} ${item.danger ? 'is-danger' : ''}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(idx, 14) * 0.018, duration: 0.24, ease: EASE }}
                  onPointerEnter={() => {
                    setHi(idx)
                    if (item.children) openSub(idx)
                    else setSub(null)
                  }}
                  onClick={() => run(item, idx)}
                  data-cursor={item.disabled ? 'Not available here' : item.children ? 'More' : item.label}
                >
                  {hi === idx && <motion.span layoutId={`cm-hi-${depth}`} className="cm__hi" transition={{ type: 'spring', stiffness: 600, damping: 42 }} />}
                  <span className="cm__icon" aria-hidden>{item.icon}</span>
                  <span className="cm__label">{item.label}</span>
                  {item.hint && <span className="cm__hint">{item.hint}</span>}
                  {item.children && <span className="cm__hint">›</span>}
                </motion.div>
              )
            })}
          </div>
        ))}
        {depth === 0 && <div className="cm__foot">Shift + right-click for the browser menu</div>}
      </motion.div>
      <AnimatePresence>
        {sub && flat[sub.i]?.children && (
          <Menu key={sub.i} depth={depth + 1} built={{ groups: [{ items: flat[sub.i].children! }] }} pos={sub.pos} onClose={onClose} />
        )}
      </AnimatePresence>
    </>
  )
}

export function ContextMenu() {
  const on = usePref('contextMenu')
  const build = useBuild()
  const [state, setState] = useState<{ built: Built; pos: Pos; id: number } | null>(null)
  const ids = useRef(0)

  useEffect(() => {
    if (!on) return
    const open = (e: MouseEvent) => {
      if (e.shiftKey || e.defaultPrevented) return
      const target = e.target as Element
      if (target.closest('.cm')) return
      e.preventDefault()
      const selection = window.getSelection()?.toString().trim() ?? ''
      setState({ built: build(target, selection), pos: { x: e.clientX, y: e.clientY }, id: ++ids.current })
    }
    window.addEventListener('contextmenu', open)
    return () => window.removeEventListener('contextmenu', open)
  }, [on, build])

  useEffect(() => {
    if (!state) return
    const close = (e: Event) => {
      if (e.type === 'pointerdown' && (e.target as Element).closest?.('.cm')) return
      setState(null)
    }
    window.addEventListener('pointerdown', close, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('pointerdown', close, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [state])

  return <AnimatePresence>{state && <Menu key={state.id} built={state.built} pos={state.pos} onClose={() => setState(null)} />}</AnimatePresence>
}
