import qrcode from 'qrcode-generator'
import { useSyncExternalStore } from 'react'
import { getPrefs } from './prefs'

/* QR codes and share links.

   A share link carries its whole content in the URL fragment (after #), compressed. Fragments are never sent
   to a server, so a tour or an answer can be handed to someone (or to your own phone) without uploading it
   anywhere and without them needing an account. /s on any Trailhead site opens it read-only. */

export type QrMatrix = { size: number; dark: (r: number, c: number) => boolean }

export function makeQr(text: string, level: 'L' | 'M' | 'Q' = 'M'): QrMatrix {
  const q = qrcode(0, level)
  q.addData(unescape(encodeURIComponent(text)), 'Byte')
  q.make()
  return { size: q.getModuleCount(), dark: (r, c) => q.isDark(r, c) }
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export type SharedTour = { k: 't'; repo: string; goal: string; stops: { p: string; w: string; u: string; t?: boolean }[]; at: string }
export type SharedAsk = { k: 'a'; repo: string; q: string; status: string; text: string; conf: number | null; ev: { l: string; r: string; u: string; t: string }[]; at: string }
export type Shared = SharedTour | SharedAsk

export async function encodeShare(data: Shared): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(data))
  return b64url(await pipe(raw, new CompressionStream('deflate-raw')))
}

export async function decodeShare(fragment: string): Promise<Shared> {
  const bytes = await pipe(unb64url(fragment), new DecompressionStream('deflate-raw'))
  const data = JSON.parse(new TextDecoder().decode(bytes))
  if (!data || (data.k !== 't' && data.k !== 'a')) throw new Error('This is not a Trailhead share link.')
  return data as Shared
}

/** Where share links point. A phone cannot open "localhost", so Settings lets you name the address your other
 *  devices can reach (a LAN address while developing, your deployed site later). */
export function shareOrigin(): string {
  return (getPrefs().shareBase || window.location.origin).replace(/\/+$/, '')
}

export const isLocalOrigin = (origin: string) => /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/.test(origin)

export async function shareUrl(data: Shared): Promise<string> {
  return `${shareOrigin()}/s#${await encodeShare(data)}`
}

/* The QR sheet is opened from anywhere (buttons, the context menu); one store holds what it shows. */
export type QrRequest = { title: string; url: string; note?: string; filename?: string }
let current: QrRequest | null = null
const listeners = new Set<() => void>()
export function openQr(req: QrRequest) {
  current = req
  listeners.forEach((l) => l())
}
export function closeQr() {
  current = null
  listeners.forEach((l) => l())
}
export function useQrRequest(): QrRequest | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => current,
    () => current,
  )
}
