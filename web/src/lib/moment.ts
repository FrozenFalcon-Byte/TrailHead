import { useSyncExternalStore } from 'react'
import { getPrefs } from './prefs'

/* Big moments (signed in, passkey saved, signed out) play a full-screen scene. Callers get two promises:
   `covered` resolves once the screen is fully hidden, so they can navigate or sign out underneath it, and
   `done` once the scene has lifted off the new page. */

export type MomentKind = 'signin' | 'signout' | 'passkey'
export type MomentMethod = 'github' | 'google' | 'email' | 'magic' | 'passkey'
export type MomentSpec = { kind: MomentKind; method?: MomentMethod; name?: string; detail?: string }
export type Active = MomentSpec & { id: number; x: number; y: number; covered: () => void; done: () => void; hold: Promise<unknown> }

let active: Active | null = null
let n = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

// The scene opens out of wherever the person last pressed.
let last = { x: -1, y: -1 }
if (typeof window !== 'undefined') window.addEventListener('pointerdown', (e) => (last = { x: e.clientX, y: e.clientY }), { capture: true, passive: true })

export function playMoment(spec: MomentSpec, hold: Promise<unknown> = Promise.resolve()): { covered: Promise<void>; done: Promise<void> } {
  const quiet = !getPrefs().celebrate || getPrefs().motion === 'off'
  if (quiet) return { covered: Promise.resolve(), done: hold.then(() => undefined, () => undefined) }
  let covered!: () => void
  let done!: () => void
  const c = new Promise<void>((r) => (covered = r))
  const d = new Promise<void>((r) => (done = r))
  const x = last.x >= 0 ? last.x : window.innerWidth / 2
  const y = last.y >= 0 ? last.y : window.innerHeight / 2
  active = { ...spec, id: ++n, x, y, covered, done: () => { active = null; emit(); done() }, hold }
  emit()
  return { covered: c, done: d }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function useMoment(): Active | null {
  return useSyncExternalStore(subscribe, () => active, () => active)
}

/* A redirect sign-in (GitHub, magic link) leaves the page, so the way in is written down first and the callback
   page reads it back to play the right scene. */
const METHOD_KEY = 'th-signin-method'
export function rememberMethod(m: MomentMethod) {
  try {
    localStorage.setItem(METHOD_KEY, m)
  } catch {
    /* private mode */
  }
}
export function takeMethod(): MomentMethod | null {
  try {
    const m = localStorage.getItem(METHOD_KEY) as MomentMethod | null
    localStorage.removeItem(METHOD_KEY)
    return m
  } catch {
    return null
  }
}

type UserLike = { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined
export function firstName(user: UserLike) {
  const m = (user?.user_metadata ?? {}) as Record<string, string | undefined>
  return m.full_name || m.name || m.user_name || user?.email?.split('@')[0] || ''
}
