import { useSyncExternalStore } from 'react'
import { getPrefs } from './prefs'

/* Toasts: one small store any part of the app can push to. The Toaster draws them. */

export type Tone = 'success' | 'error' | 'info' | 'job' | 'warn'
export type Toast = {
  id: number
  tone: Tone
  title: string
  body?: string
  action?: { label: string; run: () => void }
  /** Seconds before it leaves on its own; 0 keeps it until dismissed. */
  ttl: number
  /** Toasts sharing a key replace each other instead of stacking. */
  key?: string
}

let items: Toast[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function toast(t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }): number {
  const p = getPrefs()
  if (t.tone === 'success' && !p.toastSuccess) return 0
  if (t.tone === 'error' && !p.toastErrors) return 0
  if (t.tone === 'job' && !p.toastJobs) return 0
  const id = next++
  if (t.key) items = items.filter((x) => x.key !== t.key)
  items = [...items.slice(-Math.max(0, Math.round(p.toastStack) - 1)), { ...t, id, ttl: t.ttl ?? (t.tone === 'error' ? p.toastDuration + 3 : p.toastDuration) }]
  emit()
  if (p.toastSound) chime(t.tone)
  // A finished job while the tab is in the background also gets a desktop notification, if allowed.
  if (t.tone === 'job' && p.desktopNotify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(`Trailhead · ${t.title}`, { body: t.body })
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
  return id
}

/** A soft two-note chime made on the spot; no sound files. Higher for good news, lower for errors.
 *  Browsers start audio muted until the page has been clicked or typed into, so the first gesture anywhere wakes
 *  the audio context (and wakes it again if the browser suspends it later, as Safari does in background tabs). */
let audio: AudioContext | null = null
function context(): AudioContext | null {
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    return audio
  } catch {
    return null
  }
}
if (typeof window !== 'undefined') {
  const wake = () => {
    if (!getPrefs().toastSound && !audio) return
    const a = context()
    if (a && a.state !== 'running') a.resume().catch(() => undefined)
  }
  for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, wake, { passive: true, capture: true })
}

export function chime(tone: Tone) {
  const a = context()
  if (!a) return
  const play = () => {
    const notes = tone === 'error' ? [392, 330] : tone === 'warn' ? [440, 392] : tone === 'success' || tone === 'job' ? [660, 880] : [587, 698]
    const out = a.createGain()
    out.gain.value = 0.9
    out.connect(a.destination)
    notes.forEach((f, i) => {
      const t0 = a.currentTime + 0.02 + i * 0.11
      // a sine for the note and a quiet triangle an octave up, so it carries on laptop speakers
      for (const [type, mult, peak] of [['sine', 1, 0.16], ['triangle', 2, 0.035]] as const) {
        const o = a.createOscillator()
        const g = a.createGain()
        o.type = type
        o.frequency.value = f * mult
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(peak, t0 + 0.015)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42)
        o.connect(g).connect(out)
        o.start(t0)
        o.stop(t0 + 0.45)
      }
    })
  }
  if (a.state === 'running') play()
  else a.resume().then(() => { if (a.state === 'running') play() }, () => undefined)
}

/** A buzz from a paired device: a bright two-tone trill, three times, loud enough to hear across a room. */
export function ring() {
  const a = context()
  if (!a) return
  const play = () => {
    const out = a.createGain()
    out.gain.value = 1
    out.connect(a.destination)
    for (let burst = 0; burst < 3; burst++)
      for (let i = 0; i < 6; i++) {
        const t0 = a.currentTime + 0.02 + burst * 0.42 + i * 0.05
        const o = a.createOscillator()
        const g = a.createGain()
        o.type = 'square'
        o.frequency.value = i % 2 ? 988 : 1319
        g.gain.setValueAtTime(0, t0)
        g.gain.linearRampToValueAtTime(0.06, t0 + 0.006)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
        o.connect(g).connect(out)
        o.start(t0)
        o.stop(t0 + 0.06)
      }
  }
  if (a.state === 'running') play()
  else a.resume().then(() => { if (a.state === 'running') play() }, () => undefined)
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

export function clearToasts() {
  items = []
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => items, () => items)
}

/** Shorthands. */
export const notify = {
  ok: (title: string, body?: string) => toast({ tone: 'success', title, body }),
  error: (title: string, body?: string) => toast({ tone: 'error', title, body }),
  info: (title: string, body?: string) => toast({ tone: 'info', title, body }),
  warn: (title: string, body?: string) => toast({ tone: 'warn', title, body }),
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
