import { useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { shareOrigin } from './qr'

/* Pairing a phone with this screen.

   The desktop makes a random code and shows it as a QR; the phone opens /pair#CODE. Both join a Supabase Realtime
   broadcast channel named after the code (or, without Supabase, a BroadcastChannel, which links two tabs of one
   browser for local testing). Nothing is stored anywhere: messages only pass between the two open pages, and the
   link ends when either side closes it. Whoever holds the code can steer navigation, scroll, point and pass text,
   so the desktop only accepts known pages and never opens a link by itself. */

export type Role = 'host' | 'phone'
export type Status = 'off' | 'waiting' | 'linked' | 'lost'
export type Drop = { id: string; from: Role; text: string; title?: string; at: number }
export type Traffic = { id: number; dir: 'in' | 'out'; kind: string }

export type Msg =
  | { t: 'hello'; device: string; page?: string }
  | { t: 'welcome'; device: string; page?: string }
  | { t: 'beat' }
  | { t: 'bye' }
  | { t: 'go'; to: string }
  | { t: 'page'; page: string }
  | { t: 'scroll'; dy: number }
  | { t: 'point'; dx: number; dy: number }
  | { t: 'tap' }
  | { t: 'ask'; q: string }
  | { t: 'drop'; text: string; title?: string }
  | { t: 'ring' }
type Wire = Msg & { from: Role }

/** Pages the phone may send the desktop to. */
export const PAIR_PAGES = [
  { to: '/app', label: 'Overview', glyph: 'M4 12 L12 4 L20 12 M7 10 V20 H17 V10' },
  { to: '/app/ask', label: 'Ask', glyph: 'M5 6 H19 V16 H11 L7 20 V16 H5 Z' },
  { to: '/app/tour', label: 'Tour', glyph: 'M5 19 C 9 15, 6 9, 12 8 S 17 4, 19 5 M17 3 L19 5 L17 7' },
  { to: '/app/issues', label: 'First issues', glyph: 'M6 20 V4 M6 5 H17 L14 9 L17 13 H6' },
  { to: '/app/map', label: 'Map', glyph: 'M4 6 L9 4 L15 6 L20 4 V18 L15 20 L9 18 L4 20 Z M9 4 V18 M15 6 V20' },
  { to: '/app/find', label: 'Find', glyph: 'M10.5 4 A6.5 6.5 0 1 1 10.5 17 A6.5 6.5 0 1 1 10.5 4 Z M15.5 15.5 L20 20' },
  { to: '/app/repos', label: 'Repositories', glyph: 'M4 7 H20 V19 H4 Z M8 7 V4 H16 V7' },
  { to: '/', label: 'Home', glyph: 'M3 19 L9 9 L13 15 L16 11 L21 19 Z' },
] as const

export const pagePath = (p: string) => p.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
const allowed = (to: string) => PAIR_PAGES.some((p) => p.to === pagePath(to))

type State = {
  role: Role | null
  code: string
  status: Status
  peer: string
  page: string
  since: number
  drops: Drop[]
  traffic: Traffic[]
}

let state: State = { role: null, code: '', status: 'off', peer: '', page: '', since: 0, drops: [], traffic: [] }
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
export const getPair = () => state
export function usePair(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => state,
    () => state,
  )
}

/* Commands for the page that acts on them (the desktop's PairHost, the phone's controller). */
type Handler = (m: Msg) => void
const handlers = new Set<Handler>()
export function onPairMessage(h: Handler) {
  handlers.add(h)
  return () => {
    handlers.delete(h)
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')
}
export const validCode = (c: string) => new RegExp(`^[${ALPHABET}]{8}$`).test(c)
export const prettyCode = (c: string) => `${c.slice(0, 4)}·${c.slice(4)}`
export const phoneUrl = (code: string) => `${shareOrigin()}/pair#${code}`

export function deviceName(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Mac/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  if (/Linux/.test(ua)) return 'Linux computer'
  return 'this device'
}

/* ---------- transport ---------- */

let send: (m: Wire) => void = () => undefined
let close: () => void = () => undefined
let beat = 0
let watch = 0
let lastSeen = 0
let trafficId = 0
// Pointer and scroll moves are many and small: they skip the traffic markers.
const QUIET = new Set(['beat', 'point', 'scroll', 'hello', 'welcome', 'page'])

function mark(dir: 'in' | 'out', kind: string) {
  if (QUIET.has(kind)) return
  set({ traffic: [...state.traffic.slice(-5), { id: ++trafficId, dir, kind }] })
}
export function clearTraffic(id: number) {
  set({ traffic: state.traffic.filter((t) => t.id !== id) })
}

function receive(m: Wire) {
  if (!state.role || m.from === state.role) return
  lastSeen = Date.now()
  if (m.t === 'bye') {
    set({ status: 'lost', peer: state.peer })
    return
  }
  if (state.status !== 'linked') set({ status: 'linked', since: state.since && state.status === 'lost' ? state.since : Date.now() })
  if (m.t === 'hello' || m.t === 'welcome') {
    set({ peer: m.device, ...(m.page ? { page: m.page } : {}) })
    if (m.t === 'hello') post({ t: 'welcome', device: deviceName(), page: state.role === 'host' ? location.pathname : undefined })
  }
  if (m.t === 'page') set({ page: m.page })
  if (m.t === 'go' && (state.role !== 'host' || !allowed(m.to))) return
  if (m.t === 'drop') {
    const text = String(m.text).slice(0, 4000)
    if (!text.trim()) return
    set({ drops: [{ id: `${Date.now()}-${trafficId}`, from: m.from, text, title: m.title?.slice(0, 120), at: Date.now() }, ...state.drops].slice(0, 12) })
  }
  mark('in', m.t)
  handlers.forEach((h) => h(m))
}

export function post(m: Msg) {
  if (!state.role) return
  send({ ...m, from: state.role } as Wire)
  mark('out', m.t)
}

function connect(code: string) {
  close()
  if (supabase) {
    const sb = supabase
    const ch = sb.channel(`pair-${code}`, { config: { broadcast: { self: false, ack: false } } })
    ch.on('broadcast', { event: 'm' }, ({ payload }) => receive(payload as Wire))
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') post({ t: 'hello', device: deviceName(), page: state.role === 'host' ? location.pathname : undefined })
    })
    const mine = (m: Wire) => void ch.send({ type: 'broadcast', event: 'm', payload: m })
    send = mine
    close = () => {
      void sb.removeChannel(ch)
      if (send === mine) send = () => undefined // a newer channel may already be sending
    }
  } else {
    const bc = new BroadcastChannel(`th-pair-${code}`)
    bc.onmessage = (e) => receive(e.data as Wire)
    const mine = (m: Wire) => bc.postMessage(m)
    send = mine
    close = () => {
      bc.close()
      if (send === mine) send = () => undefined
    }
    window.setTimeout(() => post({ t: 'hello', device: deviceName(), page: state.role === 'host' ? location.pathname : undefined }), 50)
  }
  window.clearInterval(beat)
  window.clearInterval(watch)
  beat = window.setInterval(() => post({ t: 'beat' }), 4000)
  watch = window.setInterval(() => {
    if (state.status === 'linked' && Date.now() - lastSeen > 11000) set({ status: 'lost' })
  }, 1000)
}

const SAVED = 'th-pair'

/** Desktop: make a code (or pick up the one this tab was already showing) and wait for a phone. */
export function startHosting(fresh = false) {
  if (state.role === 'host' && !fresh) return state.code
  let code = ''
  try {
    const saved = sessionStorage.getItem(SAVED)
    if (!fresh && saved && validCode(saved)) code = saved
  } catch {
    /* storage blocked */
  }
  code ||= makeCode()
  try {
    sessionStorage.setItem(SAVED, code)
  } catch {
    /* kept for this page only */
  }
  set({ role: 'host', code, status: 'waiting', peer: '', page: location.pathname, since: 0, drops: [], traffic: [] })
  connect(code)
  return code
}

/** Phone: join the code from the scanned link. */
export function joinAsPhone(code: string) {
  if (state.role === 'phone' && state.code === code) return
  set({ role: 'phone', code, status: 'waiting', peer: '', page: '', since: 0, drops: [], traffic: [] })
  connect(code)
}

/** End the link on both sides. */
export function unpair() {
  if (state.role) post({ t: 'bye' })
  window.clearInterval(beat)
  window.clearInterval(watch)
  const end = close
  close = () => undefined
  window.setTimeout(end, 120) // let the goodbye leave first
  try {
    sessionStorage.removeItem(SAVED)
  } catch {
    /* nothing saved */
  }
  set({ role: null, code: '', status: 'off', peer: '', page: '', since: 0, drops: [], traffic: [] })
}

/** A desktop tab that was pairing before a reload keeps its code, so the phone finds it again. */
export function resumeHosting() {
  try {
    const saved = sessionStorage.getItem(SAVED)
    if (saved && validCode(saved) && !state.role) startHosting()
  } catch {
    /* storage blocked */
  }
}

export function dismissDrop(id: string) {
  set({ drops: state.drops.filter((d) => d.id !== id) })
}

export const isLink = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())
