import { useSyncExternalStore } from 'react'

/* Every setting the person can change, kept in this browser and (when they turn sync on) copied to their
   Supabase profile so another device picks it up. Settings that change how the page looks are mirrored onto
   <html> as data attributes and CSS variables, so the stylesheet does the work. */

export type Accent = 'lime' | 'orange' | 'violet' | 'blue' | 'green' | 'yellow'
export type ToastPos = 'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-right' | 'top-center'

export type Prefs = {
  accent: Accent
  density: 'comfortable' | 'compact'
  textSize: 'sm' | 'md' | 'lg'
  motion: 'full' | 'calm' | 'off'
  pageTransition: 'sweep' | 'rise' | 'slide' | 'none'
  cursor: 'trail' | 'system'
  cursorLabels: boolean
  cursorBurst: boolean
  contextMenu: boolean
  sidebarStory: boolean
  slotMeter: boolean
  sideCollapsed: boolean
  layoutWidth: 'contained' | 'wide'
  toastPosition: ToastPos
  toastDuration: number
  toastStyle: 'solid' | 'pastel' | 'ink' | 'paper'
  toastSize: 'compact' | 'roomy'
  toastEntrance: 'drop' | 'flip' | 'slide' | 'stamp'
  toastStack: number
  toastIcons: boolean
  toastFuse: boolean
  toastSound: boolean
  toastHoldOnHover: boolean
  updateNotice: 'toast' | 'quiet' | 'auto'
  toastSuccess: boolean
  toastErrors: boolean
  toastJobs: boolean
  desktopNotify: boolean
  tourNotes: boolean
  autoSave: boolean
  askExamples: boolean
  startPage: string
  confirmSignOut: boolean
  shortcuts: boolean
  timeFormat: '12h' | '24h'
  shareBase: string
  syncToAccount: boolean
  greetByName: boolean
  celebrate: boolean
  smoothScroll: boolean
  dashIntro: boolean
  typedHints: boolean
}

export const DEFAULTS: Prefs = {
  accent: 'lime',
  density: 'comfortable',
  textSize: 'md',
  motion: 'full',
  pageTransition: 'sweep',
  cursor: 'trail',
  cursorLabels: true,
  cursorBurst: true,
  contextMenu: true,
  sidebarStory: true,
  slotMeter: true,
  sideCollapsed: false,
  layoutWidth: 'contained',
  toastPosition: 'bottom-right',
  toastDuration: 4.5,
  toastStyle: 'pastel',
  toastSuccess: true,
  toastErrors: true,
  toastJobs: true,
  desktopNotify: false,
  tourNotes: true,
  autoSave: true,
  askExamples: true,
  startPage: '/app',
  confirmSignOut: false,
  shortcuts: true,
  timeFormat: '12h',
  shareBase: '',
  syncToAccount: false,
  greetByName: true,
  celebrate: true,
  smoothScroll: true,
  dashIntro: true,
  typedHints: true,
  toastSize: 'roomy',
  toastEntrance: 'drop',
  toastStack: 4,
  toastIcons: true,
  toastFuse: true,
  toastSound: false,
  toastHoldOnHover: true,
  updateNotice: 'toast',
}

const KEY = 'th-prefs'
const listeners = new Set<() => void>()
let state: Prefs = load()

// Settings with a fixed set of choices. A value saved by an older build that is no longer offered falls back to the
// default instead of quietly switching the feature off.
const CHOICES: Partial<Record<keyof Prefs, readonly string[]>> = {
  accent: ['lime', 'orange', 'violet', 'blue', 'green', 'yellow'],
  density: ['comfortable', 'compact'],
  textSize: ['sm', 'md', 'lg'],
  motion: ['full', 'calm', 'off'],
  pageTransition: ['sweep', 'rise', 'slide', 'none'],
  cursor: ['trail', 'system'],
  layoutWidth: ['contained', 'wide'],
  toastPosition: ['bottom-right', 'bottom-left', 'bottom-center', 'top-right', 'top-center'],
  toastStyle: ['solid', 'pastel', 'ink', 'paper'],
  toastSize: ['compact', 'roomy'],
  toastEntrance: ['drop', 'flip', 'slide', 'stamp'],
  updateNotice: ['toast', 'quiet', 'auto'],
  timeFormat: ['12h', '24h'],
}

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')) }
  } catch {
    return { ...DEFAULTS }
  }
}

const ACCENT_INK: Record<Accent, string> = { lime: 'var(--solid)', orange: 'var(--solid)', violet: '#fbf8f1', blue: '#fbf8f1', green: '#fbf8f1', yellow: 'var(--solid)' }

export function applyPrefs(p: Prefs = state) {
  const root = document.documentElement
  root.dataset.density = p.density
  root.dataset.text = p.textSize
  root.dataset.motion = p.motion
  root.dataset.width = p.layoutWidth
  root.style.setProperty('--accent', `var(--${p.accent})`)
  root.style.setProperty('--on-accent', ACCENT_INK[p.accent])
}

export function getPrefs(): Prefs {
  return state
}

export function setPrefs(patch: Partial<Prefs>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    /* blocked storage: the change still applies for this visit */
  }
  applyPrefs(state)
  listeners.forEach((l) => l())
}

export function resetPrefs() {
  setPrefs({ ...DEFAULTS })
}

export function subscribePrefs(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
}

export function usePref<K extends keyof Prefs>(key: K): Prefs[K] {
  return useSyncExternalStore(subscribePrefs, () => state[key], () => state[key])
}

/** Only known keys with the right type survive an import or a sync from the account. */
export function sanitize(input: unknown): Partial<Prefs> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<Prefs> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const allowed = CHOICES[k as keyof Prefs]
    if (k in DEFAULTS && typeof v === typeof DEFAULTS[k as keyof Prefs] && (!allowed || allowed.includes(v as string))) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/** Time of day in the person's chosen clock. */
export function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: state.timeFormat === '12h' })
}
