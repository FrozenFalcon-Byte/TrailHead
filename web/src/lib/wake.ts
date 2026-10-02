import { useSyncExternalStore } from 'react'
import { BASE } from './base'

/* Is the hosted API awake? The free host sleeps after a quiet spell and takes about a minute to come back, during
   which requests hang or fail. This store pings /api/health from the moment the app loads (so the server is already
   waking while someone signs in) and keeps pinging until it answers. It checks again whenever a request fails, when
   the tab comes back after a while, and every few minutes while the tab is open. The wake splash draws the wait. */

export type WakePhase = 'checking' | 'waking' | 'awake' | 'up' | 'down'
export type Wake = { phase: WakePhase; since: number; took: number; tries: number }

/** Roughly how long a cold start takes on the free tier, in seconds. */
export const COLD_START_S = 50
const SHOW_AFTER_MS = 1800
const GIVE_UP_MS = 150_000
// in development, ?wakedemo pretends the server takes 12s to boot, so the sheet can be seen without a real host
let demo = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('wakedemo')
let demoUntil = Date.now() + 12000
let hosted = BASE !== '' || demo

let state: Wake = { phase: 'checking', since: Date.now(), took: 0, tries: 0 }
const listeners = new Set<() => void>()
const set = (patch: Partial<Wake>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let running = false
let lastOk = 0
const RECHECK_IDLE_MS = 6 * 60_000
async function ping(timeout: number): Promise<boolean> {
  if (demo && Date.now() < demoUntil) {
    await new Promise((r) => window.setTimeout(r, 1500))
    return false
  }
  const ctl = new AbortController()
  const id = window.setTimeout(() => ctl.abort(), timeout)
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: ctl.signal, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(id)
  }
}

/** Start (or restart) watching. Safe to call repeatedly; only one loop runs. */
export function watchWake() {
  if (running) return
  running = true
  const since = Date.now()
  set({ phase: 'checking', since, tries: 0, took: 0 })
  const slow = window.setTimeout(() => state.phase === 'checking' && set({ phase: hosted ? 'waking' : 'checking' }), SHOW_AFTER_MS)
  const loop = async () => {
    while (true) {
      set({ tries: state.tries + 1 })
      // a sleeping host holds the first request until it boots, so give each try room to land
      if (await ping(hosted ? 20000 : 4000)) {
        lastOk = Date.now()
        window.clearTimeout(slow)
        if (state.phase === 'waking') {
          set({ phase: 'awake', took: Date.now() - since })
          window.setTimeout(() => set({ phase: 'up' }), 3200)
        } else set({ phase: 'up' })
        break
      }
      if (!hosted || Date.now() - since > GIVE_UP_MS) {
        window.clearTimeout(slow)
        set({ phase: 'down' })
        break
      }
      if (state.phase === 'checking') set({ phase: 'waking' })
      await new Promise((r) => window.setTimeout(r, 2500))
    }
    running = false
  }
  loop()
}

/** Called when a regular request fails: the host may have gone back to sleep. */
export function suspectSleep() {
  if (state.phase === 'up' || state.phase === 'down') watchWake()
}

/** Called when a regular request gets an answer. */
export function noteAlive() {
  lastOk = Date.now()
}

// The host naps after about 15 quiet minutes. Coming back to a tab after a while, check before anything is needed,
// and while the tab is open check every few minutes so a nap is noticed (and the wait starts) straight away.
if (typeof window !== 'undefined' && hosted) {
  const stale = () => document.visibilityState === 'visible' && Date.now() - lastOk > RECHECK_IDLE_MS && (state.phase === 'up' || state.phase === 'down')
  document.addEventListener('visibilitychange', () => stale() && watchWake())
  window.addEventListener('focus', () => stale() && watchWake())
  window.setInterval(() => stale() && watchWake(), 60_000)
}

export function dismissWake() {
  if (state.phase === 'awake') set({ phase: 'up' })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
// in development, window.__thWake(seconds) pretends the server just fell asleep, to see the splash on any page
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __thWake: (s?: number) => void }).__thWake = (secs = 12) => {
    demo = true
    hosted = true
    demoUntil = Date.now() + secs * 1000
    running = false
    watchWake()
  }
}

export const useWake = () => useSyncExternalStore(subscribe, () => state)
export const isHosted = () => hosted
