import { supabase } from './supabase'

/** Where the API lives. Empty in development (Vite proxies /api); set VITE_API_URL when the API is hosted elsewhere. */
export const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
const url = (path: string) => (path.startsWith('/api') ? BASE + path : path)

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!supabase) return {}
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeader()), ...(init.headers || {}) },
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export type StreamEvent = { kind: string; data: any }

/** POST that answers with Server-Sent Events. EventSource cannot send a body or headers, so this reads the stream by hand. */
export async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(await authHeader()) },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) {
    let message = res.statusText
    try {
      message = (await res.json()).detail ?? message
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, typeof message === 'string' ? message : JSON.stringify(message))
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let cut: number
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut)
      buffer = buffer.slice(cut + 2)
      let kind = 'message'
      const lines: string[] = []
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event: ')) kind = line.slice(7).trim()
        else if (line.startsWith('data: ')) lines.push(line.slice(6))
      }
      if (lines.length) onEvent({ kind, data: JSON.parse(lines.join('\n')) })
    }
  }
}
