import { useCallback, useEffect, useRef, useState } from 'react'
import { GONE_MS, MAX_PLAYERS, apply, join, leave, newGame, newer, takeOver, tick, type Act, type Game, type MarkerId } from './logic'
import { openRoom, type Room } from './transport'

/* One room, seen from one browser. Whoever opens a code first becomes the referee: it runs the rules, ticks the
   clock and broadcasts the whole game after every change (and every two seconds, so a phone that missed a message
   catches up). Everyone else sends actions to the referee. If the referee disappears, the earliest remaining
   player picks the game up from the last state they saw and carries on; if the referee leaves on purpose it hands
   the game over at once. */

export type Me = { id: string; name: string; marker: MarkerId }
export type Status = 'connecting' | 'live' | 'lost'

const CLAIM_MS = 2200 // nobody answered "hello" in this long: the room is empty, so open it
const HOST_GONE_MS = 4500
const HOST_LEFT_MS = 1200
const BEAT_MS = 2000

export function useGame(code: string, me: Me) {
  const [game, setGame] = useState<Game | null>(null)
  const [status, setStatus] = useState<Status>('connecting')
  const [present, setPresent] = useState<Set<string>>(new Set())
  const gRef = useRef<Game | null>(null)
  const offset = useRef(0) // add to the referee's clock to get this browser's clock
  const room = useRef<Room | null>(null)
  const seen = useRef(new Map<string, number>())
  const here = useRef(new Set<string>())
  const everHere = useRef(new Set<string>()) // everyone presence has ever shown in this room
  const meRef = useRef(me)
  const joinedAt = useRef(Date.now())
  const askedToJoin = useRef(0)
  meRef.current = me

  const isHost = () => gRef.current?.host === meRef.current.id

  const commit = useCallback((next: Game) => {
    if (next === gRef.current) return
    gRef.current = next
    setGame(next)
    if (next.host === meRef.current.id) room.current?.send('state', { g: next, now: Date.now() })
  }, [])

  const act = useCallback((a: Act) => {
    const g = gRef.current
    if (g && g.host === meRef.current.id) commit(apply(g, a, Date.now()))
    else room.current?.send('act', a)
  }, [commit])

  // a player who is not seated (or was marked away) asks the referee for a seat, at most every two seconds
  const ensureSeat = useCallback(() => {
    const g = gRef.current
    const m = meRef.current
    if (!g || g.host === m.id) return
    const mine = g.players.find((p) => p.id === m.id)
    const wants = mine ? mine.away || mine.name !== m.name : g.players.filter((p) => !p.bot && !p.away).length < MAX_PLAYERS
    if (wants && Date.now() - askedToJoin.current > 2000) {
      askedToJoin.current = Date.now()
      room.current?.send('act', { t: 'join', id: m.id, name: m.name, marker: m.marker, at: joinedAt.current } satisfies Act)
    }
  }, [])

  useEffect(() => {
    const id = meRef.current.id
    seen.current = new Map()
    here.current = new Set()
    everHere.current = new Set()
    const r = openRoom(code, { id, at: joinedAt.current }, {
      status: setStatus,
      peers: (list) => {
        const now = Date.now()
        list.forEach((p) => seen.current.set(p.id, now))
        here.current = new Set(list.map((p) => p.id))
        list.forEach((p) => everHere.current.add(p.id))
        setPresent(here.current)
        if (isHost()) room.current?.send('state', { g: gRef.current, now }) // say hello to whoever just arrived
      },
      message: (event, payload) => {
        const g = gRef.current
        if (event === 'state' && payload?.g) {
          const incoming: Game = payload.g
          if (!newer(g, incoming)) return
          let next = incoming
          if (incoming.host === id) {
            // handed the referee's whistle: move the phase deadline onto this browser's clock
            const shift = Date.now() - payload.now
            next = { ...incoming, until: incoming.until ? incoming.until + shift : 0, next: incoming.phase === 'run' ? Date.now() + 125 : 0 }
            offset.current = 0
            gRef.current = next
            setGame(next)
            room.current?.send('state', { g: next, now: Date.now() })
            return
          }
          offset.current = Date.now() - payload.now
          gRef.current = next
          setGame(next)
          incoming.players.forEach((p) => seen.current.has(p.id) || seen.current.set(p.id, Date.now()))
          seen.current.set(incoming.host, Date.now())
          ensureSeat()
        } else if (event === 'hello' && isHost()) {
          room.current?.send('state', { g, now: Date.now() })
        } else if (event === 'act' && isHost() && g) {
          if (payload?.id) seen.current.set(payload.id, Date.now())
          commit(apply(g, payload as Act, Date.now()))
        }
      },
    })
    room.current = r
    r.send('hello', { id })
    const again = window.setTimeout(() => r.send('hello', { id }), 900)
    const claim = window.setTimeout(() => {
      if (gRef.current) return
      const m = meRef.current
      const now = Date.now()
      offset.current = 0
      commit(join(newGame(code, id, now), id, m.name, m.marker, joinedAt.current))
    }, CLAIM_MS)

    const clock = window.setInterval(() => {
      const g = gRef.current
      if (g && isHost()) commit(tick(g, Date.now(), Math.random))
    }, 16)
    const beat = window.setInterval(() => {
      if (isHost() && gRef.current) room.current?.send('state', { g: gRef.current, now: Date.now() })
      ensureSeat()
    }, BEAT_MS)
    const watch = window.setInterval(() => {
      const g = gRef.current
      if (!g) return
      const now = Date.now()
      here.current.forEach((pid) => seen.current.set(pid, now)) // presence only reports changes; still here counts as seen
      const lastSeen = (pid: string) => seen.current.get(pid) ?? joinedAt.current
      if (g.host === id) {
        // the referee lets go of players whose phones went quiet
        for (const p of g.players) if (p.id !== id && !p.bot && !p.away && now - lastSeen(p.id) > GONE_MS) commit(apply(gRef.current!, { t: 'leave', id: p.id }, now))
        return
      }
      // presence saying the referee has gone is trusted quickly; silence alone takes longer
      const gone = everHere.current.has(g.host) && !here.current.has(g.host) && now - lastSeen(g.host) > HOST_LEFT_MS
      if (!gone && now - lastSeen(g.host) < HOST_GONE_MS) return
      // the referee vanished: the earliest player still here takes over from the last state everyone saw
      const heirs = g.players.filter((p) => !p.bot && !p.away && p.id !== g.host && (p.id === id || now - lastSeen(p.id) < HOST_GONE_MS)).sort((a, b) => a.joinedAt - b.joinedAt)
      if (heirs[0]?.id !== id) return
      const next = takeOver(g, id, now, offset.current)
      offset.current = 0
      commit(next)
    }, 1000)

    const goodbye = () => {
      const g = gRef.current
      if (g && g.host === id) {
        // hand the game to the earliest other player still here instead of making everyone wait for a timeout
        const heir = g.players.filter((p) => p.id !== id && !p.bot && !p.away).sort((a, b) => a.joinedAt - b.joinedAt)[0]
        if (heir) room.current?.send('state', { g: leave({ ...g, host: heir.id, epoch: g.epoch + 1, v: g.v + 1 }, id), now: Date.now() })
      } else room.current?.send('act', { t: 'leave', id } satisfies Act)
    }
    window.addEventListener('pagehide', goodbye)

    // a referee whose tab goes to the background gets its timers slowed to a crawl, which would slow the race for
    // everyone; mid-match it passes the whistle to a player who is still here and keeps playing as a normal seat
    let hiding = 0
    const onHide = () => {
      window.clearTimeout(hiding)
      if (document.visibilityState !== 'hidden') return
      hiding = window.setTimeout(() => {
        const g = gRef.current
        if (!g || g.host !== id || document.visibilityState !== 'hidden' || g.phase === 'lobby' || g.phase === 'podium') return
        const heir = g.players.filter((p) => p.id !== id && !p.bot && !p.away && here.current.has(p.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0]
        if (!heir) return
        const next = { ...g, host: heir.id, epoch: g.epoch + 1, v: g.v + 1 }
        gRef.current = next
        setGame(next)
        room.current?.send('state', { g: next, now: Date.now() })
      }, 1200)
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      goodbye()
      window.clearTimeout(hiding)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', goodbye)
      ;[again, claim].forEach(window.clearTimeout)
      ;[clock, beat, watch].forEach(window.clearInterval)
      r.close()
      room.current = null
      gRef.current = null
    }
  }, [code, commit, ensureSeat])

  // a new name or marker chosen mid-lobby reaches the referee
  useEffect(() => {
    const g = gRef.current
    const mine = g?.players.find((p) => p.id === me.id)
    if (g && mine && (mine.name !== me.name || mine.marker !== me.marker)) act({ t: 'profile', id: me.id, name: me.name, marker: me.marker })
  }, [me.name, me.marker, me.id, act])

  /** The current phase's deadline on this browser's clock. */
  const deadline = game?.until ? game.until + (game.host === me.id ? 0 : offset.current) : 0
  return { game, status, present, act, deadline, isHost: game?.host === me.id, kind: room.current?.kind }
}
