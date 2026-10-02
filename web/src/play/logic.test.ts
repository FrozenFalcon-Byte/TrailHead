import { describe, expect, it } from 'vitest'
import {
  BOOST_TICKS, COUNTDOWN_MS, MAX_PLAYERS, PICKUP_EVERY, ROUND_END_MS, SIZE, TICK_MS,
  again, apply, botDir, cell, isCode, join, makeCode, newGame, newer, ranking, start, step, takeOver, tick, turn, xy,
  type Game, type Player,
} from './logic'

const seq = (...xs: number[]) => {
  let i = 0
  return () => xs[i++ % xs.length]
}
const r0 = () => 0.5
const lobby = (n = 2) => {
  let g = newGame('ABCD', 'a', 1000)
  ;['a', 'b', 'c', 'd'].slice(0, n).forEach((id, i) => (g = join(g, id, id.toUpperCase(), 'orange', 1000 + i)))
  return g
}
const running = (g: Game, now = 5000) => tick(start(g, now), now + COUNTDOWN_MS, r0)
const P = (g: Game, id: string) => g.players.find((p) => p.id === id)!
const head = (p: Player) => xy(p.path[p.path.length - 1])
/** Puts one player somewhere on purpose, facing a direction. */
const place = (g: Game, id: string, path: number[], dir: 0 | 1 | 2 | 3): Game => ({ ...g, players: g.players.map((p) => (p.id === id ? { ...p, path, dir, queue: [] } : p)) })

describe('lobby', () => {
  it('seats up to four people and keeps colours apart', () => {
    const g = lobby(4)
    expect(g.players).toHaveLength(4)
    expect(new Set(g.players.map((p) => p.marker)).size).toBe(4)
    expect(join(g, 'e', 'E', 'blue', 9)).toBe(g)
  })
  it('a person takes a bot seat when the room is full', () => {
    let g = lobby(3)
    g = apply(g, { t: 'bot', id: 'a', add: true }, 2000)
    expect(g.players.filter((p) => p.bot)).toHaveLength(1)
    g = join(g, 'e', 'E', 'lime', 3000)
    expect(g.players).toHaveLength(MAX_PLAYERS)
    expect(g.players.some((p) => p.bot)).toBe(false)
  })
  it('only the host adds bots or starts', () => {
    const g = lobby(2)
    expect(apply(g, { t: 'bot', id: 'b', add: true }, 1)).toBe(g)
    expect(apply(g, { t: 'start', id: 'b' }, 1)).toBe(g)
    expect(apply(g, { t: 'start', id: 'a' }, 1).phase).toBe('countdown')
  })
  it('a solo start brings a bot along', () => {
    const g = start(lobby(1), 10)
    expect(g.players).toHaveLength(2)
    expect(g.players[1].bot).toBe(true)
  })
  it('names are cleaned', () => {
    const g = join(newGame('ABCD', 'a', 0), 'x', '  <b>hi</b>\u0007 ', 'blue', 0)
    expect(g.players[0].name).toBe('bhi/b')
  })
})

describe('rounds', () => {
  it('counts down, then moves every tick', () => {
    let g = start(lobby(2), 5000)
    expect(g.phase).toBe('countdown')
    expect(tick(g, 5000 + COUNTDOWN_MS - 1, r0)).toBe(g)
    g = tick(g, 5000 + COUNTDOWN_MS, r0)
    expect(g.phase).toBe('run')
    const before = head(P(g, 'a'))
    g = tick(g, g.next, r0)
    expect(head(P(g, 'a'))).toEqual([before[0] + 1, before[1]])
    expect(P(g, 'a').path).toHaveLength(2)
  })
  it('turns are queued, one per tick, and no reversing', () => {
    let g = running(lobby(2))
    g = turn(g, 'a', 3) // straight back: ignored
    expect(P(g, 'a').queue).toEqual([])
    g = turn(g, 'a', 2)
    g = turn(g, 'a', 3)
    expect(P(g, 'a').queue).toEqual([2, 3])
    g = step(g, 0, r0)
    expect(P(g, 'a').dir).toBe(2)
    g = step(g, 0, r0)
    expect(P(g, 'a').dir).toBe(3)
  })
  it('hitting a wall, a trail or your own trail ends your round', () => {
    let g = running(lobby(2))
    g = place(g, 'a', [cell(0, 5)], 3)
    g = step(g, 0, r0)
    expect(P(g, 'a').crash).toBe('wall')
    expect(g.phase).toBe('roundEnd')
    expect(g.roundWinner).toBe('b')
    expect(P(g, 'b').score).toBe(1)

    let h = running(lobby(3))
    h = place(h, 'b', [cell(10, 9), cell(10, 10), cell(10, 11)], 2)
    h = place(h, 'a', [cell(8, 10), cell(9, 10)], 1)
    h = step(h, 0, r0)
    expect(P(h, 'a').crash).toBe('b')
    expect(P(h, 'b').boxed).toBe(1)
    expect(h.events.at(-1)).toMatchObject({ t: 'crash', who: 'a', by: 'b' })
    expect(h.phase).toBe('run') // two still going

    let s = running(lobby(2))
    s = place(s, 'a', [cell(5, 5), cell(6, 5), cell(6, 6), cell(5, 6)], 0)
    s = step(s, 0, r0)
    expect(P(s, 'a').crash).toBe('self')
  })
  it('two markers heading into the same cell both crash, and nobody wins that round', () => {
    let g = running(lobby(2))
    g = place(g, 'a', [cell(9, 10)], 1)
    g = place(g, 'b', [cell(11, 10)], 3)
    g = step(g, 0, r0)
    expect(P(g, 'a').alive || P(g, 'b').alive).toBe(false)
    expect(g.phase).toBe('roundEnd')
    expect(g.roundWinner).toBeNull()
  })
  it("a crashed marker's trail stops blocking", () => {
    let g = running(lobby(3))
    g = place(g, 'c', [cell(20, 9), cell(20, 10), cell(20, 11)], 0)
    g = { ...g, players: g.players.map((p) => (p.id === 'c' ? { ...p, alive: false } : p)) }
    g = place(g, 'a', [cell(19, 10)], 1)
    g = step(g, 0, r0)
    expect(P(g, 'a').alive).toBe(true)
  })
  it('the match ends at three round wins, then a rematch goes back to the lobby', () => {
    let g = running(lobby(2))
    g = { ...g, players: g.players.map((p) => (p.id === 'b' ? { ...p, score: 2 } : p)) }
    g = place(g, 'a', [cell(0, 5)], 3)
    g = step(g, 7000, r0)
    expect(g.phase).toBe('roundEnd')
    g = tick(g, 7000 + ROUND_END_MS, r0)
    expect(g.phase).toBe('podium')
    expect(g.winners).toEqual(['b'])
    expect(ranking(g)[0].id).toBe('b')
    g = again(g)
    expect(g.phase).toBe('lobby')
    expect(g.players.every((p) => p.score === 0)).toBe(true)
  })
  it('a round that is not the last starts the next countdown', () => {
    let g = running(lobby(2))
    g = place(g, 'a', [cell(0, 5)], 3)
    g = step(g, 7000, r0)
    g = tick(g, 7000 + ROUND_END_MS, r0)
    expect(g.phase).toBe('countdown')
    expect(g.round).toBe(2)
    expect(g.players.every((p) => p.alive && p.path.length === 1)).toBe(true)
  })
  it('a slow referee catches up a little, never a lot', () => {
    let g = running(lobby(2), 0)
    const t0 = g.tick
    g = tick(g, g.next + TICK_MS * 10, r0)
    expect(g.tick - t0).toBe(3)
  })
  it('a newcomer mid-round waits for the next one', () => {
    let g = running(lobby(2))
    g = join(g, 'c', 'C', 'blue', 5)
    expect(P(g, 'c').alive).toBe(false)
  })
  it('a player who leaves mid-round stops; if they were the last rival the round ends', () => {
    let g = running(lobby(2))
    g = apply(g, { t: 'leave', id: 'b' }, 0)
    expect(P(g, 'b').away).toBe(true)
    g = step(g, 0, r0)
    expect(g.phase).toBe('roundEnd')
  })
})

describe('pickups', () => {
  it('drop on open ground at a steady pace', () => {
    let g = running(lobby(2))
    for (let i = 0; i < PICKUP_EVERY; i++) g = step(g, 0, seq(0.37, 0.61, 0.2, 0.8, 0.5))
    expect(g.pickups.length).toBe(1)
  })
  it('fast-forward moves two cells a tick for a while', () => {
    let g = running(lobby(2))
    g = place(g, 'a', [cell(5, 10)], 1)
    g = { ...g, pickups: [{ cell: cell(6, 10), kind: 'boost' }] }
    g = step(g, 0, r0)
    expect(P(g, 'a').boost).toBe(BOOST_TICKS - 1)
    expect(g.events.at(-1)).toMatchObject({ t: 'pick', kind: 'boost' })
    expect(head(P(g, 'a'))).toEqual([7, 10]) // the boost starts on the tick it is picked up
    g = step(g, 0, r0)
    expect(head(P(g, 'a'))).toEqual([9, 10])
  })
  it('stash slips through a trail', () => {
    let g = running(lobby(2))
    g = place(g, 'b', [cell(10, 9), cell(10, 10), cell(10, 11)], 2)
    g = place(g, 'a', [cell(8, 10)], 1)
    g = { ...g, pickups: [{ cell: cell(9, 10), kind: 'ghost' }] }
    g = step(g, 0, r0)
    g = step(g, 0, r0)
    expect(P(g, 'a').alive).toBe(true)
    expect(P(g, 'b').path).toContain(cell(10, 10))
  })
  it('revert wipes trails nearby but leaves heads', () => {
    let g = running(lobby(2))
    g = place(g, 'b', [cell(12, 8), cell(12, 9), cell(12, 10), cell(12, 11)], 2)
    g = place(g, 'a', [cell(9, 10)], 1)
    g = { ...g, pickups: [{ cell: cell(10, 10), kind: 'revert' }] }
    g = step(g, 0, r0)
    const b = P(g, 'b')
    for (const y of [8, 9, 10]) expect(b.path).not.toContain(cell(12, y))
    expect(b.path.at(-1)).toBe(cell(12, 12))
  })
})

describe('bots', () => {
  it('never steer into a wall when there is a way out', () => {
    let g = running(lobby(1).players.length ? start(lobby(1), 0) : lobby(1), 0)
    const bot = g.players.find((p) => p.bot)!
    g = place(g, bot.id, [cell(SIZE - 1, 5)], 1)
    const d = botDir(g, P(g, bot.id), r0)
    expect([0, 2]).toContain(d)
  })
  it('a field of four bots plays a whole round to the end', () => {
    let g = newGame('BOTS', 'h', 0)
    g = join(g, 'h', 'H', 'orange', 0)
    for (let i = 0; i < 3; i++) g = apply(g, { t: 'bot', id: 'h', add: true }, i + 1)
    g = start(g, 0)
    g = { ...g, players: g.players.map((p) => (p.bot ? p : { ...p, bot: true })) } // the host plays as a bot too
    g = tick(g, COUNTDOWN_MS, Math.random)
    let n = 0
    while (g.phase === 'run' && n++ < 2000) g = step(g, 0, Math.random)
    expect(g.phase).toBe('roundEnd')
  })
})

describe('sync', () => {
  it('prefers the older room, then the newer referee, then the newer version', () => {
    const a = newGame('ABCD', 'x', 100)
    expect(newer(null, a)).toBe(true)
    expect(newer(a, { ...a, born: 50 })).toBe(true)
    expect(newer(a, { ...a, born: 150, v: 99 })).toBe(false)
    expect(newer(a, { ...a, epoch: 1 })).toBe(true)
    expect(newer({ ...a, epoch: 1 }, { ...a, v: 50 })).toBe(false)
    expect(newer(a, { ...a, v: 1 })).toBe(true)
    expect(newer(a, { ...a, code: 'WXYZ', v: 9 })).toBe(false)
  })
  it('a new referee moves deadlines onto its own clock and lets the old one go', () => {
    const g = start(lobby(3), 1000)
    const t = takeOver(g, 'b', 2000, 500)
    expect(t.host).toBe('b')
    expect(t.epoch).toBe(1)
    expect(t.until).toBe(g.until + 500)
    expect(P(t, 'a').away).toBe(true)
  })
  it('room codes are four easy letters', () => {
    for (let i = 0; i < 50; i++) expect(isCode(makeCode())).toBe(true)
    expect(isCode('ABIO')).toBe(false)
  })
})
