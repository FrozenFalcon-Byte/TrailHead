import { useEffect, useState } from 'react'

/* Word wrap for code blocks, one switch for the whole site: wrapping one block wraps them all, and the choice is
   remembered, since someone reading on a phone wants it everywhere and someone on a wide screen nowhere. */

const KEY = 'th-wrap'
const EVENT = 'th:wrap'

export function wrapOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setWrap(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode: it still applies until the page closes */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: on }))
}

export function onWrap(fn: (on: boolean) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<boolean>).detail)
  const s = (e: StorageEvent) => e.key === KEY && fn(e.newValue === '1')
  window.addEventListener(EVENT, h)
  window.addEventListener('storage', s)
  return () => {
    window.removeEventListener(EVENT, h)
    window.removeEventListener('storage', s)
  }
}

export function useWrap(): [boolean, () => void] {
  const [on, setOn] = useState(wrapOn)
  useEffect(() => onWrap(setOn), [])
  return [on, () => setWrap(!on)]
}

/** The glyph on every wrap button: a line that runs on, or one that turns back under itself. */
export const WRAP_GLYPH = (on: boolean) => (on ? 'M4 7h13a3 3 0 0 1 0 6H9m0 0 2.5-2.5M9 13l2.5 2.5M4 17h6' : 'M4 7h16M4 12h16M4 17h10')
