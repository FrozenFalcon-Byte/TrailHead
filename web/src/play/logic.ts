/* Trail Blazers rules, as pure functions over one plain object. The host's browser is the referee: it applies every
   action here, steps the arena on a fixed tick and broadcasts the result, so every screen shows the same race.
   Nothing in this file touches the network or the clock directly; `now` and `rand` are passed in, which keeps it
   deterministic under test.

   Each player is a trail marker that never stops moving and blazes a trail behind it. Running into a wall or any
   trail (your own included) ends your round. The last marker still moving wins the round; first to three rounds
   wins the match. Pickups on the ground: fast-forward (double speed), stash (slip through trails) and revert
   (wipe the trails around you). Empty seats can be filled with bots. */

export const SIZE = 30 // the arena is SIZE x SIZE cells
export const TICK_MS = 125
export const MAX_PLAYERS = 4
export const WIN_SCORE = 3
export const COUNTDOWN_MS = 3000
export const ROUND_END_MS = 3200
export const BOOST_TICKS = 18
export const GHOST_TICKS = 18
export const REVERT_RADIUS = 3
export const PICKUP_EVERY = 26 // ticks between pickup drops
export const MAX_PICKUPS = 3
export const GONE_MS = 7000 // a player missing from presence this long is dropped from the lobby or marked away

export type MarkerId = 'orange' | 'blue' | 'green' | 'violet' | 'yellow' | 'lime'
export type Phase = 'lobby' | 'countdown' | 'run' | 'roundEnd' | 'podium'
export type Dir = 0 | 1 | 2 | 3 // up, right, down, left
export type Power = 'boost' | 'ghost' | 'revert'

export type Player = {
  id: string
  name: string
  marker: MarkerId
  joinedAt: number
  bot: boolean
  away: boolean
  score: number // rounds won this match
  alive: boolean
  path: number[] // cells blazed this round, oldest first; the last one is the head
  dir: Dir
  queue: Dir[] // turns asked for, applied one per tick
  boost: number // ticks of fast-forward left
  ghost: number // ticks of stash left
  boxed: number // rivals who crashed into this player's trail, this match
  best: number // longest trail this match
  crash: string | null // what ended this round: 'wall', 'self', 'head' or the id whose trail it hit
}

export type Pickup = { cell: number; kind: Power }
export type Ev = { id: string; t: 'crash' | 'pick'; who: string; cell: number; by?: string; kind?: Power }

export type Game = {
  code: string
  born: number // when the room was made; the older of two rival hosts wins
  epoch: number // bumped whenever the referee changes hands
  v: number // bumped on every change
  host: string
  phase: Phase
  round: number
  goal: number // round wins needed
  until: number // host clock, when a countdown or round-end banner finishes (0 = waits for the host)
  tick: number
  next: number // host clock, when the next tick is due
  players: Player[]
  pickups: Pickup[]
  events: Ev[] // the latest crashes and pickups, for the screens to animate
  roundWinner: string | null
  winners: string[]
}

export type Act =
  | { t: 'join'; id: string; name: string; marker: MarkerId; at: number }
  | { t: 'leave'; id: string }
  | { t: 'start'; id: string }
  | { t: 'turn'; id: string; dir: Dir }
  | { t: 'bot'; id: string; add: boolean }
  | { t: 'again'; id: string }
  | { t: 'profile'; id: string; name: string; marker: MarkerId }

export const MARKER_IDS: MarkerId[] = ['orange', 'blue', 'green', 'violet', 'yellow', 'lime']
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'
const DX = [0, 1, 0, -1]
const DY = [-1, 0, 1, 0]
// Corners, each heading clockwise so nobody starts nose to nose. Two players take opposite corners.
const STARTS: { x: number; y: number; dir: Dir }[] = [
  { x: 4, y: 4, dir: 1 },
  { x: SIZE - 5, y: SIZE - 5, dir: 3 },
  { x: SIZE - 5, y: 4, dir: 2 },
  { x: 4, y: SIZE - 5, dir: 0 },
]
const BOT_COLOURS: MarkerId[] = ['green', 'orange', 'yellow', 'blue', 'lime', 'violet']
const BOT_NAMES = ['Pinebot', 'Cairn', 'Switchback', 'Scree', 'Talus', 'Ridgeline']

export const cell = (x: number, y: number) => y * SIZE + x
export const xy = (c: number) => [c % SIZE, Math.floor(c / SIZE)] as const
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir
export const racers = (g: Game) => g.players.filter((p) => !p.away)
export const alive = (g: Game) => g.players.filter((p) => p.alive)
export const humans = (g: Game) => g.players.filter((p) => !p.bot && !p.away)
export const cleanName = (name: string) => name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Blazer'
const bump = (g: Game): Game => ({ ...g, v: g.v + 1 })

function freeMarker(g: Game, want: MarkerId, except?: string): MarkerId {
  const taken = new Set(g.players.filter((p) => p.id !== except).map((p) => p.marker))
  return taken.has(want) ? (MARKER_IDS.find((m) => !taken.has(m)) ?? want) : want
}

function blank(id: string, name: string, marker: MarkerId, at: number, bot: boolean): Player {
  return { id, name, marker, joinedAt: at, bot, away: false, score: 0, alive: false, path: [], dir: 1, queue: [], boost: 0, ghost: 0, boxed: 0, best: 0, crash: null }
}

export function newGame(code: string, host: string, now: number, goal = WIN_SCORE): Game {
  return { code, born: now, epoch: 0, v: 0, host, phase: 'lobby', round: 0, goal, until: 0, tick: 0, next: 0, players: [], pickups: [], events: [], roundWinner: null, winners: [] }
}

/** A seat for a new player. Bots give their seat up to a person; during a round a newcomer waits for the next one. */
export function join(g: Game, id: string, name: string, marker: MarkerId, at: number): Game {
  const have = g.players.find((p) => p.id === id)
  if (have) return have.away || have.name !== cleanName(name) ? bump({ ...g, players: g.players.map((p) => (p.id === id ? { ...p, away: false, name: cleanName(name) } : p)) }) : g
  let players = g.players
  if (players.length >= MAX_PLAYERS) {
    const bot = [...players].reverse().find((p) => p.bot || p.away)
    if (!bot) return g
    players = players.filter((p) => p.id !== bot.id)
  }
  const seat = blank(id, cleanName(name), freeMarker({ ...g, players }, marker), at, false)
  return bump({ ...g, players: [...players, seat] })
}

export function addBot(g: Game, at: number): Game {
  if (g.players.length >= MAX_PLAYERS || (g.phase !== 'lobby' && g.phase !== 'podium')) return g
  const n = g.players.filter((p) => p.bot).length
  const used = new Set(g.players.map((p) => p.name))
  const name = BOT_NAMES.find((b) => !used.has(b)) ?? `Bot ${n + 1}`
  const id = `bot-${at.toString(36)}-${n}`
  // bots take the colours that are easiest to tell apart on the ground first
  const taken = new Set(g.players.map((p) => p.marker))
  const marker = BOT_COLOURS.find((m) => !taken.has(m) && !(m === 'violet' && taken.has('blue')) && !(m === 'blue' && taken.has('violet'))) ?? freeMarker(g, 'lime')
  return bump({ ...g, players: [...g.players, blank(id, name, marker, at, true)] })
}

export function removeBot(g: Game): Game {
  const bot = [...g.players].reverse().find((p) => p.bot)
  if (!bot || (g.phase !== 'lobby' && g.phase !== 'podium')) return g
  return bump({ ...g, players: g.players.filter((p) => p.id !== bot.id) })
}

export function setProfile(g: Game, id: string, name: string, marker: MarkerId): Game {
  if (!g.players.some((p) => p.id === id)) return g
  return bump({ ...g, players: g.players.map((p) => (p.id === id ? { ...p, name: cleanName(name), marker: freeMarker(g, marker, id) } : p)) })
}

/** Between rounds a leaver gives up the seat; mid-round their marker stops where it is. */
export function leave(g: Game, id: string): Game {
  if (!g.players.some((p) => p.id === id)) return g
  if (g.phase === 'lobby' || g.phase === 'podium') return bump({ ...g, players: g.players.filter((p) => p.id !== id) })
  return bump({ ...g, players: g.players.map((p) => (p.id === id ? { ...p, away: true, alive: false, queue: [] } : p)) })
}

export function start(g: Game, now: number): Game {
  if (g.phase !== 'lobby' || !humans(g).length) return g
  let next = g
  while (racers(next).length < 2) next = addBot(next, now + racers(next).length)
  return newRound({ ...next, players: next.players.map((p) => ({ ...p, score: 0, boxed: 0, best: 0 })), round: 0, winners: [] }, now)
}

export function newRound(g: Game, now: number): Game {
  const seated = racers(g)
  const order = seated.length === 2 ? [0, 1] : [0, 2, 1, 3]
  let i = 0
  const players = g.players.map((p) => {
    if (p.away) return { ...p, alive: false, path: [], queue: [], crash: null }
    const s = STARTS[order[i++ % 4]]
    return { ...p, alive: true, path: [cell(s.x, s.y)], dir: s.dir, queue: [], boost: 0, ghost: 0, crash: null }
  })
  return bump({ ...g, phase: 'countdown', round: g.round + 1, until: now + COUNTDOWN_MS, tick: 0, next: 0, players, pickups: [], events: [], roundWinner: null })
}

export function turn(g: Game, id: string, dir: Dir): Game {
  if (g.phase !== 'run' && g.phase !== 'countdown') return g
  const p = g.players.find((q) => q.id === id)
  if (!p || !p.alive || ![0, 1, 2, 3].includes(dir)) return g
  const last = p.queue.length ? p.queue[p.queue.length - 1] : p.dir
  if (dir === last || dir === opposite(last) || p.queue.length >= 3) return g
  return bump({ ...g, players: g.players.map((q) => (q.id === id ? { ...q, queue: [...q.queue, dir] } : q)) })
}

/* ---------- the arena ---------- */

function occupancy(players: Player[]): Map<number, string> {
  const occ = new Map<number, string>()
  for (const p of players) if (p.alive) for (const c of p.path) occ.set(c, p.id) // a crashed marker's trail crumbles away
  return occ
}

function ahead(c: number, d: Dir): number {
  const [x, y] = xy(c)
  const nx = x + DX[d]
  const ny = y + DY[d]
  return nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE ? -1 : cell(nx, ny)
}

/** How many cells a marker could still reach from here, up to a limit: the bots' sense of open ground. */
function room(from: number, occ: Map<number, string>, limit: number): number {
  if (from < 0 || occ.has(from)) return 0
  const seen = new Set([from])
  const todo = [from]
  while (todo.length && seen.size < limit) {
    const c = todo.pop()!
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const n = ahead(c, d)
      if (n >= 0 && !occ.has(n) && !seen.has(n)) {
        seen.add(n)
        todo.push(n)
      }
    }
  }
  return seen.size
}

/** A bot looks one step ahead in each direction and goes for the most open ground, drifting towards pickups. */
export function botDir(g: Game, p: Player, rand: () => number): Dir {
  const occ = occupancy(g.players)
  const head = p.path[p.path.length - 1]
  const heads = g.players.filter((q) => q.alive && q.id !== p.id).map((q) => q.path[q.path.length - 1])
  const [hx, hy] = xy(head)
  const options = [p.dir, ((p.dir + 1) % 4) as Dir, ((p.dir + 3) % 4) as Dir]
  let best = p.dir
  let bestScore = -Infinity
  for (const d of options) {
    const n = ahead(head, d)
    if (n < 0 || (occ.has(n) && p.ghost <= 1)) continue
    let s = room(n, occ, 140)
    const [nx, ny] = xy(n)
    for (const h of heads) {
      const [x, y] = xy(h)
      if (Math.abs(x - nx) + Math.abs(y - ny) <= 1) s -= 40
    }
    for (const k of g.pickups) {
      const [x, y] = xy(k.cell)
      const was = Math.abs(x - hx) + Math.abs(y - hy)
      const now = Math.abs(x - nx) + Math.abs(y - ny)
      if (was <= 8 && now < was) s += 6
    }
    s += d === p.dir ? 2 : 0
    s += rand() * 4
    if (s > bestScore) {
      bestScore = s
      best = d
    }
  }
  return rand() < 0.02 ? options[1 + Math.floor(rand() * 2)] : best
}

/** One tick: everyone turns, moves one cell (two on fast-forward), and crashes are settled. */
export function step(g: Game, now: number, rand: () => number): Game {
  let players = g.players.map((p) => {
    if (!p.alive) return p
    if (p.bot) return { ...p, dir: botDir(g, p, rand) }
    let { dir } = p
    const queue = [...p.queue]
    while (queue.length) {
      const d = queue.shift()!
      if (d !== dir && d !== opposite(dir)) {
        dir = d
        break
      }
    }
    return { ...p, dir, queue }
  })
  let pickups = g.pickups
  const events: Ev[] = []
  const tick = g.tick + 1
  const crash = (id: string, why: string, at: number) => {
    players = players.map((p) => (p.id === id ? { ...p, alive: false, crash: why } : p))
    if (why !== 'wall' && why !== 'self' && why !== 'head') players = players.map((p) => (p.id === why ? { ...p, boxed: p.boxed + 1 } : p))
    events.push({ id: `${g.round}.${tick}.${id}`, t: 'crash', who: id, cell: at, by: why })
  }
  for (let sub = 0; sub < 2; sub++) {
    const movers = players.filter((p) => p.alive && (sub === 0 || p.boost > 0))
    if (!movers.length) break
    const occ = occupancy(players)
    const target = new Map(movers.map((p) => [p.id, ahead(p.path[p.path.length - 1], p.dir)]))
    const count = new Map<number, number>()
    target.forEach((c) => c >= 0 && count.set(c, (count.get(c) ?? 0) + 1))
    for (const p of movers) {
      const c = target.get(p.id)!
      if (c < 0) crash(p.id, 'wall', p.path[p.path.length - 1])
      else if ((count.get(c) ?? 0) > 1) crash(p.id, 'head', c)
      else if (occ.has(c) && p.ghost <= 0) crash(p.id, occ.get(c) === p.id ? 'self' : occ.get(c)!, c)
    }
    for (const p of movers) {
      const c = target.get(p.id)!
      const me = players.find((q) => q.id === p.id)!
      if (!me.alive) continue
      // stashed markers pass over trails without blazing over them, so the trail underneath survives
      const over = me.ghost > 0 && occupancy(players).has(c)
      let next: Player = { ...me, path: over ? [...me.path.filter((x) => x !== c), c] : [...me.path, c] }
      const got = pickups.find((k) => k.cell === c)
      if (got) {
        pickups = pickups.filter((k) => k !== got)
        events.push({ id: `${g.round}.${tick}.${p.id}.${got.kind}`, t: 'pick', who: p.id, cell: c, kind: got.kind })
        if (got.kind === 'boost') next = { ...next, boost: BOOST_TICKS }
        else if (got.kind === 'ghost') next = { ...next, ghost: GHOST_TICKS }
        else {
          const [cx, cy] = xy(c)
          const near = (x: number) => {
            const [px, py] = xy(x)
            return Math.max(Math.abs(px - cx), Math.abs(py - cy)) <= REVERT_RADIUS
          }
          players = players.map((q) => (q.id === p.id ? q : { ...q, path: q.path.filter((x, i) => i === q.path.length - 1 || !near(x)) }))
          next = { ...next, path: next.path.filter((x, i) => i === next.path.length - 1 || !near(x)) }
        }
      }
      players = players.map((q) => (q.id === p.id ? next : q))
    }
  }
  players = players.map((p) => (p.alive ? { ...p, boost: Math.max(0, p.boost - 1), ghost: Math.max(0, p.ghost - 1), best: Math.max(p.best, p.path.length) } : p))

  if (tick % PICKUP_EVERY === 0 && pickups.length < MAX_PICKUPS) {
    const occ = occupancy(players)
    const heads = players.filter((p) => p.alive).map((p) => xy(p.path[p.path.length - 1]))
    for (let tries = 0; tries < 40; tries++) {
      const c = Math.floor(rand() * SIZE * SIZE)
      const [x, y] = xy(c)
      if (x < 1 || y < 1 || x > SIZE - 2 || y > SIZE - 2 || occ.has(c) || pickups.some((k) => k.cell === c)) continue
      if (heads.some(([hx, hy]) => Math.abs(hx - x) + Math.abs(hy - y) < 4)) continue
      const kinds: Power[] = ['boost', 'ghost', 'revert']
      pickups = [...pickups, { cell: c, kind: kinds[Math.floor(rand() * 3)] }]
      break
    }
  }

  let next: Game = { ...g, v: g.v + 1, tick, players, pickups, events: [...g.events, ...events].slice(-16) }
  const started = next.players.filter((p) => p.path.length > 0).length // everyone who lined up this round
  const left = alive(next)
  if (left.length === 0 || (started > 1 && left.length === 1)) {
    const winner = left[0]?.id ?? null
    next = { ...next, phase: 'roundEnd', until: now + ROUND_END_MS, roundWinner: winner, players: next.players.map((p) => (p.id === winner ? { ...p, score: p.score + 1 } : p)) }
  }
  return next
}

export function ranking(g: Game): Player[] {
  return [...g.players].sort((a, b) => b.score - a.score || b.boxed - a.boxed || b.best - a.best || a.joinedAt - b.joinedAt)
}

export function again(g: Game): Game {
  if (g.phase !== 'podium') return g
  const players = g.players.filter((p) => !p.away).map((p) => ({ ...p, score: 0, boxed: 0, best: 0, alive: false, path: [], queue: [], crash: null }))
  return bump({ ...g, phase: 'lobby', round: 0, until: 0, tick: 0, players, pickups: [], events: [], roundWinner: null, winners: [] })
}

/** Moves the game along: called by the referee every few milliseconds. Returns the same object when nothing changed. */
export function tick(g: Game, now: number, rand: () => number): Game {
  if (g.phase === 'countdown' && g.until && now >= g.until) return bump({ ...g, phase: 'run', until: 0, next: now + TICK_MS })
  if (g.phase === 'run') {
    if (!racers(g).length) return again({ ...g, phase: 'podium' })
    let next = g
    let steps = 0
    while (next.phase === 'run' && now >= next.next && steps < 3) {
      next = { ...step(next, now, rand), next: next.next + TICK_MS }
      steps++
    }
    if (next.phase === 'run' && now - next.next > TICK_MS * 3) next = { ...next, next: now + TICK_MS } // a sleepy tab does not fast-forward the race
    return next
  }
  if (g.phase === 'roundEnd' && g.until && now >= g.until) {
    const top = Math.max(0, ...g.players.map((p) => p.score))
    if (top >= g.goal) return bump({ ...g, phase: 'podium', until: 0, winners: g.players.filter((p) => p.score === top).map((p) => p.id) })
    return newRound(g, now)
  }
  return g
}

export function apply(g: Game, a: Act, now: number): Game {
  switch (a.t) {
    case 'join':
      return join(g, a.id, a.name, a.marker, a.at)
    case 'leave':
      return leave(g, a.id)
    case 'profile':
      return setProfile(g, a.id, a.name, a.marker)
    case 'turn':
      return turn(g, a.id, a.dir)
    case 'start':
      return a.id === g.host ? start(g, now) : g
    case 'bot':
      return a.id === g.host ? (a.add ? addBot(g, now) : removeBot(g)) : g
    case 'again':
      return a.id === g.host ? again(g) : g
  }
}

/** The referee changes hands: deadlines move onto the new referee's clock and the old one's seat is let go. */
export function takeOver(g: Game, id: string, now: number, offset: number): Game {
  const moved = { ...g, host: id, epoch: g.epoch + 1, v: g.v + 1, until: g.until ? g.until + offset : 0, next: g.phase === 'run' ? now + TICK_MS : 0 }
  return g.host === id ? moved : leave(moved, g.host)
}

/** Which of two copies of a room to believe: the older room, then the latest referee, then the latest change. */
export function newer(a: Game | null, b: Game): boolean {
  if (!a) return true
  if (a.code !== b.code) return false
  if (a.born !== b.born) return b.born < a.born
  if (a.epoch !== b.epoch) return b.epoch > a.epoch
  return b.v > a.v
}

export const makeCode = (rand: () => number = Math.random) => Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)]).join('')
export const isCode = (s: string) => /^[A-HJKMNP-Z]{4}$/.test(s)
