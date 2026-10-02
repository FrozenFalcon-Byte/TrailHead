import { useEffect, useState } from 'react'

/* Watches /version.json for a newer build of the dashboard than the one this tab loaded. Checks on an interval and
   whenever the tab comes back into view. */

export type Release = { id: string; built: string; changes: string[] }
const EVERY = 60_000
let latest: Release | null = null
const listeners = new Set<(r: Release | null) => void>()

// The build this tab is running. A production build knows its own id; the dev server's compiled-in id never
// changes, so in dev the baseline is whatever version.json said when the page loaded.
let base: string | null = import.meta.env.DEV ? null : __BUILD_ID__
const fetchRelease = async (): Promise<Release | null> => {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  return res.ok ? ((await res.json()) as Release) : null
}

async function check() {
  try {
    const r = await fetchRelease()
    if (!r?.id) return
    if (base === null) {
      base = r.id
      return
    }
    if (r.id !== base && r.id !== latest?.id) {
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
  void check() // in dev this records the baseline right away
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
