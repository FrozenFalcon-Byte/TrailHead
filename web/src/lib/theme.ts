import { useSyncExternalStore } from 'react'

/* Light is the default. A choice made with the switch is remembered in this browser only. */

export type Theme = 'light' | 'dark'
const KEY = 'trailhead-theme'
const listeners = new Set<() => void>()

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#131217' : '#fbf8f1')
}

export function initTheme() {
  apply(read())
}

export function setTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.add('theme-swap')
  apply(theme)
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* storage can be blocked; the theme still applies for this visit */
  }
  window.setTimeout(() => root.classList.remove('theme-swap'), 600)
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const snapshot = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as Theme

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, snapshot, () => 'light' as Theme), setTheme]
}
