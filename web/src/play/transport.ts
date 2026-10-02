import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/* How the browsers in one room talk. Online it is a Supabase Realtime channel: broadcast for messages and presence
   for who is here, both open to anyone with the public key, so nobody has to sign in. Without Supabase (local
   development, tests) a BroadcastChannel joins tabs of the same browser and fakes presence with heartbeats. */

export type Peer = { id: string; at: number }
export type Handlers = { message: (event: string, payload: any) => void; peers: (peers: Peer[]) => void; status: (s: 'connecting' | 'live' | 'lost') => void }
export type Room = { send: (event: string, payload: unknown) => void; close: () => void; kind: 'realtime' | 'local' }

export function wantsLocal(): boolean {
  return !supabase || new URLSearchParams(window.location.search).get('net') === 'local'
}

export function openRoom(code: string, me: Peer, on: Handlers): Room {
  return wantsLocal() ? openLocal(code, me, on) : openRealtime(code, me, on)
}

function openRealtime(code: string, me: Peer, on: Handlers): Room {
  const client = supabase!
  let channel: RealtimeChannel | null = null
  let closed = false
  let retry = 0
  const queue: { event: string; payload: unknown }[] = []
  let live = false

  const connect = () => {
    on.status('connecting')
    const ch = client.channel(`scramble:${code}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me.id } } })
    channel = ch
    ch.on('broadcast', { event: '*' }, (m) => on.message(m.event, m.payload))
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<{ id: string; at: number }>()
      on.peers(Object.values(state).flatMap((metas) => metas.slice(0, 1)).map((m) => ({ id: m.id, at: m.at })))
    })
    ch.subscribe(async (status) => {
      if (closed) return
      if (status === 'SUBSCRIBED') {
        live = true
        retry = 0
        on.status('live')
        await ch.track({ id: me.id, at: me.at })
        while (queue.length) {
          const m = queue.shift()!
          ch.send({ type: 'broadcast', event: m.event, payload: m.payload })
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        live = false
        on.status('lost')
        client.removeChannel(ch)
        // phones drop sockets when the screen locks; come back with a gentle backoff
        window.setTimeout(() => !closed && channel === ch && connect(), Math.min(8000, 600 * 2 ** retry++))
      }
    })
  }
  connect()
  const wake = () => {
    if (document.visibilityState === 'visible' && !live && !closed) {
      if (channel) client.removeChannel(channel)
      connect()
    }
  }
  document.addEventListener('visibilitychange', wake)

  return {
    kind: 'realtime',
    send: (event, payload) => {
      if (live && channel) channel.send({ type: 'broadcast', event, payload })
      else queue.push({ event, payload })
    },
    close: () => {
      closed = true
      document.removeEventListener('visibilitychange', wake)
      // removed at once: reopening the same room straight away gets the same channel back from the client
      if (channel) {
        channel.untrack()
        client.removeChannel(channel)
      }
    },
  }
}

const BEAT_MS = 900
const EXPIRE_MS = 3200

function openLocal(code: string, me: Peer, on: Handlers): Room {
  const bc = new BroadcastChannel(`scramble:${code}`)
  const seen = new Map<string, Peer & { last: number }>([[me.id, { ...me, last: Date.now() }]])
  const report = () => on.peers([...seen.values()].map(({ id, at }) => ({ id, at })))
  bc.onmessage = (e) => {
    const { kind, event, payload, from } = e.data ?? {}
    if (kind === 'beat') {
      const isNew = !seen.has(from.id)
      seen.set(from.id, { ...from, last: Date.now() })
      if (isNew) {
        report()
        bc.postMessage({ kind: 'beat', from: me }) // answer at once so a newcomer sees everyone straight away
      }
    } else if (kind === 'bye') {
      seen.delete(from.id)
      report()
    } else if (kind === 'msg') on.message(event, payload)
  }
  const beat = () => {
    bc.postMessage({ kind: 'beat', from: me })
    const now = Date.now()
    let changed = false
    for (const [id, p] of seen) if (id !== me.id && now - p.last > EXPIRE_MS && seen.delete(id)) changed = true
    seen.set(me.id, { ...me, last: now })
    if (changed) report()
  }
  on.status('live')
  beat()
  report()
  const timer = window.setInterval(beat, BEAT_MS)
  const bye = () => bc.postMessage({ kind: 'bye', from: me })
  window.addEventListener('pagehide', bye)
  return {
    kind: 'local',
    send: (event, payload) => bc.postMessage({ kind: 'msg', event, payload }),
    close: () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', bye)
      bye()
      bc.close()
    },
  }
}
