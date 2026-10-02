import { useSyncExternalStore } from 'react'
import { BASE } from './api'

/* Is the hosted API awake? The free host sleeps after a quiet spell and takes about a minute to come back, during
   which requests hang or fail. This store pings /api/health from the moment the app loads (so the server is already
   waking while someone signs in) and keeps pinging until it answers. The dashboard draws the wait from it. */

export type WakePhase = 'checking' | 'waking' | 'awake' | 'up' | 'down'
export type Wake = { phase: WakePhase; since: number; took: number; tries: number }

/** Roughly how long a cold start takes on the free tier, in seconds. */
export const COLD_START_S = 50
const SHOW_AFTER_MS = 1800
const GIVE_UP_MS = 150_000
// in development, ?wakedemo pretends the server takes 12s to boot, so the sheet can be seen without a real host
const demo = import.meta.env.DEV && typeof location !== 'undefined' && location.search.includes('wakedemo')
const demoUntil = Date.now() + 12000
const hosted = BASE !== '' || demo

let state: Wake = { phase: 'checking', since: Date.now(), took: 0, tries: 0 }
const listeners = new Set<() => void>()
const set = (patch: Partial<Wake>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

let running = false
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

export function dismissWake() {
  if (state.phase === 'awake') set({ phase: 'up' })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export const useWake = () => useSyncExternalStore(subscribe, () => state)
export const isHosted = hosted
