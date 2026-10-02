import { useEffect, useState } from 'react'

/* Watches /version.json for a newer build of the dashboard than the one this tab loaded. Checks on an interval and
   whenever the tab comes back into view. */

export type Release = { id: string; built: string; changes: string[] }
const EVERY = 60_000
let latest: Release | null = null
const listeners = new Set<(r: Release | null) => void>()

async function check() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return
    const r = (await res.json()) as Release
    if (r.id && r.id !== __BUILD_ID__ && r.id !== latest?.id) {
      latest = r
      listeners.forEach((l) => l(r))
    }
  } catch {
    /* offline or no version file: nothing to offer */
  }
}

let started = false
function start() {
  if (started) return
  started = true
  setInterval(check, EVERY)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  window.addEventListener('focus', check)
  setTimeout(check, 4000)
}

export function useRelease(): Release | null {
  const [r, setR] = useState(latest)
  useEffect(() => {
    start()
    listeners.add(setR)
    return () => void listeners.delete(setR)
  }, [])
  return r
}

export const checkNow = check
