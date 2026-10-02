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

/** A soft two-note chime made on the spot; no sound files. Higher for good news, lower for errors. */
let audio: AudioContext | null = null
export function chime(tone: Tone) {
  try {
    audio ??= new AudioContext()
    const notes = tone === 'error' ? [392, 330] : tone === 'warn' ? [440, 392] : tone === 'success' || tone === 'job' ? [660, 880] : [587, 698]
    notes.forEach((f, i) => {
      const o = audio!.createOscillator()
      const g = audio!.createGain()
      const t0 = audio!.currentTime + i * 0.09
      o.type = 'sine'
      o.frequency.value = f
      g.gain.setValueAtTime(0, t0)
      g.gain.linearRampToValueAtTime(0.06, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28)
      o.connect(g).connect(audio!.destination)
      o.start(t0)
      o.stop(t0 + 0.3)
    })
  } catch {
    /* audio blocked until the page has been clicked */
  }
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
