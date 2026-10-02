import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { shareOrigin } from '../lib/qr'
import { Mark } from '../motion/Mark'
import { QrCode } from '../motion/QrSheet'
import { Shape } from '../motion/Shapes'
import { TrailSpinner } from '../motion/TrailSpinner'
import { Board, useDemo } from './Board'
import { MARKER_IDS, MAX_PLAYERS, cleanName, isCode, makeCode, ranking, type Dir, type Ev, type Game, type MarkerId, type Player } from './logic'
import { MARKERS } from './markers'
import { useGame, type Me } from './useGame'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import './play.css'

/* Trail Blazers: a live arena for two to four players (bots fill empty seats), on phones and laptops, no sign-in.
   /play opens or joins a room; /play/ABCD is the room itself, which is what the QR code points at. */

const EASE = [0.76, 0, 0.24, 1] as const
const SPRING = { type: 'spring', stiffness: 380, damping: 26 } as const
const buzz = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not every browser allows it */
  }
}
const mk = (m: MarkerId) => MARKERS[m]
function Marker({ m, size = 24, play = false }: { m: MarkerId; size?: number; play?: boolean }) {
  return <Shape kind={mk(m).kind} color={mk(m).color} glyph={mk(m).glyph} size={size} play={play} />
}

/* ---------- who you are: a name and a marker, kept on this device; a per-tab id so two tabs are two players ---------- */

type Profile = { name: string; marker: MarkerId }
const PROFILE_KEY = 'th-play-profile'
const ID_KEY = 'th-play-id'

function readProfile(): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null')
    return p && typeof p.name === 'string' && MARKER_IDS.includes(p.marker) ? { name: cleanName(p.name), marker: p.marker } : null
  } catch {
    return null
  }
}
function playerId(): string {
  try {
    const have = sessionStorage.getItem(ID_KEY)
    if (have) return have
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
    sessionStorage.setItem(ID_KEY, id)
    return id
  } catch {
    return Math.random().toString(36).slice(2)
  }
}

/* ---------- the page ---------- */

export default function Play() {
  const { code: raw } = useParams()
  const code = (raw || '').toUpperCase()
  const [profile, setProfile] = useState<Profile | null>(readProfile)
  const [editing, setEditing] = useState(false)
  const save = (p: Profile) => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
    } catch {
      /* private mode: keep it for this visit */
    }
    setProfile(p)
    setEditing(false)
  }
  useEffect(() => {
    document.title = code ? `Room ${code} · Trail Blazers` : 'Trail Blazers · Trailhead'
  }, [code])

  return (
    <div className="pl t-cream">
      <TopBar code={isCode(code) ? code : ''} />
      <AnimatePresence mode="wait" initial={false}>
        {!raw || !isCode(code) ? (
          <Screen key="entry"><Entry bad={!!raw && !isCode(code)} /></Screen>
        ) : !profile || editing ? (
          <Screen key="who"><Who initial={profile} code={code} onDone={save} onCancel={profile ? () => setEditing(false) : undefined} /></Screen>
        ) : (
          <Screen key={`room-${code}`}><RoomView code={code} profile={profile} onEdit={() => setEditing(true)} /></Screen>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Screens change with a wipe upward: the old one is clipped away towards the top while the new one rises in. */
function Screen({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      className="pl-screen"
      initial={{ clipPath: 'inset(100% 0% 0% 0%)', y: 40 }}
      animate={{ clipPath: 'inset(0% 0% 0% 0%)', y: 0 }}
      exit={{ clipPath: 'inset(0% 0% 100% 0%)', y: -40 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      {children}
    </motion.main>
  )
}

function TopBar({ code }: { code: string }) {
  return (
    <header className="pl-top">
      <Link to="/" className="pl-top__home" aria-label="Trailhead home"><Mark size={30} /></Link>
      <Link to="/play" className="pl-top__title">Trail Blazers</Link>
      {code && <span className="pl-top__code mono" aria-label={`Room ${code}`}>{code}</span>}
    </header>
  )
}

/* ---------- entry: open a room or type a code; four bots race behind the title ---------- */

const POWERS: { m: MarkerId; kind: 'boost' | 'ghost' | 'revert'; t: string; d: string }[] = [
  { m: 'yellow', kind: 'boost', t: 'Fast-forward', d: 'Double speed for a couple of seconds. Cut across a rival before they turn.' },
  { m: 'blue', kind: 'ghost', t: 'Stash', d: 'Slip straight through trails for a moment. The way out of a dead end.' },
  { m: 'violet', kind: 'revert', t: 'Revert', d: 'Wipes every trail around you, yours included. Opens up a boxed-in corner.' },
]

function Entry({ bad }: { bad: boolean }) {
  const navigate = useNavigate()
  const demo = useDemo()
  const [code, setCode] = useState('')
  const [err, setErr] = useState(bad ? 'That room code does not look right. Codes are four letters.' : '')
  const go = (c: string) => (isCode(c) ? navigate(`/play/${c}${window.location.search}`) : setErr('Codes are four letters, like KTRV.'))
  return (
    <div className="pl-entry">
      <section className="pl-hero">
        <div className="pl-hero__copy">
          <span className="pl-kicker">A Trailhead party game · 2 to 4 players</span>
          <h1 className="pl-title">
            {'Trail Blazers'.split(' ').map((w, i) => (
              <span key={w} className="pl-title__w">
                <motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.15 + i * 0.1 }}>{w}</motion.span>
              </span>
            ))}
          </h1>
          <p className="pl-lede">Every marker keeps moving and blazes a trail behind it. Steer to box your friends in; touch a wall or any trail and your round is over. Last one still moving wins the round, first to three rounds takes the match.</p>
          <div className="pl-actions">
            <motion.button className="pl-btn is-solid" whileTap={{ scale: 0.96 }} onClick={() => navigate(`/play/${makeCode()}${window.location.search}`)}>
              <span>Open a room</span><span aria-hidden>→</span>
            </motion.button>
            <form className="pl-join" onSubmit={(e) => { e.preventDefault(); go(code) }}>
              <CodeBoxes value={code} onChange={(v) => { setCode(v); setErr('') }} onFull={go} />
              <motion.button className="pl-btn" whileTap={{ scale: 0.96 }} type="submit" disabled={code.length < 4}>Join</motion.button>
            </form>
          </div>
          <AnimatePresence>{err && <motion.p className="pl-err" initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}>{err}</motion.p>}</AnimatePresence>
        </div>
        <motion.div className="pl-hero__art" initial={{ clipPath: 'inset(100% 0% 0% 0%)' }} animate={{ clipPath: 'inset(0% 0% 0% 0%)' }} transition={{ duration: 0.8, ease: EASE, delay: 0.15 }}>
          <Board game={demo} />
        </motion.div>
      </section>
      <div className="pl-how">
        <div className="pl-how__steps">
          <h2 className="pl-h2">How to steer</h2>
          <ol>
            <li><b>Phone</b> Swipe anywhere on the arena, or use the arrow pad under it.</li>
            <li><b>Laptop</b> Arrow keys or WASD.</li>
            <li><b>Friends</b> They scan the QR code in the lobby. Empty seats can take a bot.</li>
          </ol>
        </div>
        <ul className="pl-powers">
          {POWERS.map((s, i) => (
            <motion.li key={s.t} initial={{ y: 30, rotate: i % 2 ? 2 : -2 }} animate={{ y: 0, rotate: i % 2 ? 1 : -1 }} transition={{ ...SPRING, delay: 0.35 + i * 0.08 }} style={{ background: mk(s.m).bg }}>
              <PowerIcon kind={s.kind} />
              <b>{s.t}</b>
              <span>{s.d}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function PowerIcon({ kind }: { kind: 'boost' | 'ghost' | 'revert' }) {
  return (
    <svg viewBox="0 0 40 40" width="40" className="pl-power" aria-hidden>
      <rect x="3" y="3" width="34" height="34" rx="10" />
      {kind === 'boost' && <path d="M11 13 L18 20 L11 27 M21 13 L28 20 L21 27" />}
      {kind === 'ghost' && <path d="M11 17 H29 M12.5 17 V28 H27.5 V17 M17 22 H23" />}
      {kind === 'revert' && <path d="M14 15 A8 8 0 1 1 13 25 M13 11 L14 16 L19 15" />}
    </svg>
  )
}

function CodeBoxes({ value, onChange, onFull }: { value: string; onChange: (v: string) => void; onFull?: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <label className="pl-boxes" onClick={() => ref.current?.focus()}>
      <input
        ref={ref}
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        aria-label="Room code"
        maxLength={4}
        onChange={(e) => {
          const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
          onChange(v)
          if (v.length === 4 && isCode(v)) onFull?.(v)
        }}
      />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`pl-box ${i === value.length ? 'is-at' : ''}`}>
          <AnimatePresence mode="popLayout">
            {value[i] && <motion.b key={value[i] + i} initial={{ y: 18, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -18, rotateX: 80 }} transition={SPRING}>{value[i]}</motion.b>}
          </AnimatePresence>
        </span>
      ))}
    </label>
  )
}

/* ---------- name and marker ---------- */

function Who({ initial, code, onDone, onCancel }: { initial: Profile | null; code: string; onDone: (p: Profile) => void; onCancel?: () => void }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [marker, setMarker] = useState<MarkerId>(initial?.marker ?? MARKER_IDS[Math.floor(Math.random() * 4)])
  const ok = name.trim().length > 0
  return (
    <form className="pl-who" onSubmit={(e) => { e.preventDefault(); if (ok) onDone({ name: cleanName(name), marker }) }}>
      <span className="pl-kicker">Room {code}</span>
      <h2 className="pl-h2">Who is blazing?</h2>
      <input className="pl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder="Your trail name" aria-label="Your name" autoFocus />
      <div className="pl-markers" role="radiogroup" aria-label="Your colour">
        {MARKER_IDS.map((m, i) => {
          const on = m === marker
          return (
            <motion.button key={m} type="button" role="radio" aria-checked={on} aria-label={mk(m).label} className="pl-marker" style={{ background: mk(m).bg }} onClick={() => setMarker(m)} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0, y: on ? -6 : 0 }} transition={{ ...SPRING, delay: 0.04 * i }} whileTap={{ scale: 0.9 }}>
              <Marker m={m} size={40} play={on} />
              {on && <motion.span layoutId="pl-marker-ring" className="pl-marker__ring" transition={SPRING} />}
            </motion.button>
          )
        })}
      </div>
      <p className="pl-muted">If someone in the room already has your colour, you get the next free one.</p>
      <div className="pl-row">
        {onCancel && <button type="button" className="pl-btn" onClick={onCancel}>Back</button>}
        <motion.button className="pl-btn is-solid" type="submit" disabled={!ok} whileTap={{ scale: 0.96 }}><span>{onCancel ? 'Save' : 'Into the room'}</span><span aria-hidden>→</span></motion.button>
      </div>
    </form>
  )
}

/* ---------- the room ---------- */

function useCountdown(deadline: number, live: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setNow(Date.now()), 50)
    return () => window.clearInterval(id)
  }, [live])
  return Math.max(0, deadline - now)
}

function RoomView({ code, profile, onEdit }: { code: string; profile: Profile; onEdit: () => void }) {
  const id = useMemo(playerId, [])
  const me: Me = useMemo(() => ({ id, name: profile.name, marker: profile.marker }), [id, profile.name, profile.marker])
  const { game, status, present, act, deadline, isHost } = useGame(code, me)
  const navigate = useNavigate()

  if (!game)
    return (
      <div className="pl-wait">
        <TrailSpinner label={`Looking for room ${code}`} />
        <p className="pl-muted">If nobody is here yet, the room opens for you in a moment.</p>
      </div>
    )
  const mine = game.players.find((p) => p.id === id)
  const host = game.players.find((p) => p.id === game.host)
  const view = game.phase === 'lobby' ? 'lobby' : game.phase === 'podium' ? 'podium' : 'arena'
  return (
    <div className="pl-room">
      <AnimatePresence>
        {status === 'lost' && (
          <motion.div className="pl-net" initial={{ y: -60 }} animate={{ y: 0 }} exit={{ y: -60 }} transition={SPRING}>Reconnecting…</motion.div>
        )}
      </AnimatePresence>
      {!mine && view !== 'lobby' && <div className="pl-watch">The room is full, so you are watching. A seat opens when someone leaves.</div>}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view} className="pl-view" initial={{ clipPath: 'inset(0% 0% 100% 0%)' }} animate={{ clipPath: 'inset(0% 0% 0% 0%)' }} exit={{ clipPath: 'inset(100% 0% 0% 0%)' }} transition={{ duration: 0.5, ease: EASE }}>
          {view === 'lobby' && (
            <Lobby game={game} me={id} present={present} isHost={isHost} hostName={host?.name ?? 'the host'} act={act} onEdit={onEdit} onLeave={() => navigate('/play')} />
          )}
          {view === 'arena' && <Arena game={game} me={id} deadline={deadline} act={act} />}
          {view === 'podium' && <Podium game={game} me={id} isHost={isHost} hostName={host?.name ?? 'the host'} onAgain={() => act({ t: 'again', id })} onLeave={() => navigate('/play')} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ---------- lobby ---------- */

type ActFn = ReturnType<typeof useGame>['act']

function Lobby({ game, me, present, isHost, hostName, act, onEdit, onLeave }: { game: Game; me: string; present: Set<string>; isHost: boolean; hostName: string; act: ActFn; onEdit: () => void; onLeave: () => void }) {
  const url = `${shareOrigin()}/play/${game.code}`
  const [copied, setCopied] = useState(false)
  const share = async () => {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Trail Blazers', text: `Race me in Trail Blazers: room ${game.code}`, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }
    } catch {
      /* dismissed */
    }
  }
  const seated = game.players.length
  const bots = game.players.filter((p) => p.bot).length
  return (
    <div className="pl-lobby">
      <section className="pl-card pl-invite">
        <span className="pl-kicker">Scan to join</span>
        <div className="pl-qr"><QrCode text={url} size={210} /></div>
        <div className="pl-bigcode mono" aria-label={`Room code ${game.code}`}>
          {game.code.split('').map((c, i) => (
            <motion.span key={i} initial={{ y: 30, rotate: -12 }} animate={{ y: 0, rotate: 0 }} transition={{ ...SPRING, delay: 0.1 + i * 0.06 }}>{c}</motion.span>
          ))}
        </div>
        <p className="pl-muted">or open <b>{url.replace(/^https?:\/\//, '').replace(`/${game.code}`, '')}</b> and type the code</p>
        <button className="pl-btn" onClick={share}>{copied ? 'Link copied' : 'Share the link'}</button>
      </section>
      <section className="pl-card pl-seats">
        <div className="pl-seats__head">
          <h2 className="pl-h2">Starting line</h2>
          <span className="pl-muted">{seated} of {MAX_PLAYERS}</span>
        </div>
        <ol className="pl-seatlist">
          <LayoutGroup>
            {Array.from({ length: MAX_PLAYERS }, (_, i) => {
              const p = game.players[i]
              return (
                <motion.li layout transition={SPRING} key={p?.id ?? `empty-${i}`} className={`pl-seat ${p ? '' : 'is-empty'}`} style={p ? { background: mk(p.marker).bg } : undefined}>
                  {p ? (
                    <>
                      <motion.span className="pl-seat__mark" initial={{ y: -70, rotate: -40 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 13 }}>
                        <Marker m={p.marker} size={44} />
                      </motion.span>
                      <span className="pl-seat__who">
                        <b>{p.name}{p.id === me ? ' (you)' : ''}</b>
                        <small>{p.bot ? 'bot' : p.id === game.host ? 'runs the room' : present.has(p.id) ? 'ready' : 'connecting'}</small>
                      </span>
                      {p.id === me && <button className="pl-link" onClick={onEdit}>Change</button>}
                      {p.bot && isHost && <button className="pl-link" onClick={() => act({ t: 'bot', id: me, add: false })} aria-label={`Remove ${p.name}`}>Remove</button>}
                    </>
                  ) : isHost ? (
                    <button className="pl-seat__add" onClick={() => act({ t: 'bot', id: me, add: true })}>
                      <span aria-hidden>+</span> Add a bot
                    </button>
                  ) : (
                    <span className="pl-seat__empty">Open seat</span>
                  )}
                </motion.li>
              )
            })}
          </LayoutGroup>
        </ol>
        <div className="pl-row pl-seats__go">
          <button className="pl-btn" onClick={onLeave}>Leave</button>
          {isHost ? (
            <motion.button className="pl-btn is-solid" onClick={() => act({ t: 'start', id: me })} whileTap={{ scale: 0.96 }}>
              <span>{seated > 1 ? 'Start the race' : 'Race a bot'}</span><span aria-hidden>→</span>
            </motion.button>
          ) : (
            <span className="pl-muted">Waiting for {hostName} to start</span>
          )}
        </div>
        <p className="pl-rules">
          First to {game.goal} rounds wins. {bots ? 'Bots give their seat to anyone who joins. ' : ''}People who join mid-race line up for the next round.
        </p>
      </section>
    </div>
  )
}

/* ---------- the arena ---------- */

const KEYS: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 }

function Arena({ game, me, deadline, act }: { game: Game; me: string; deadline: number; act: ActFn }) {
  const mine = game.players.find((p) => p.id === me)
  const playing = !!mine && mine.alive && (game.phase === 'run' || game.phase === 'countdown')
  const [pressed, setPressed] = useState<Dir | null>(null)
  const steer = useCallback(
    (dir: Dir) => {
      if (!playing) return
      setPressed(dir)
      window.setTimeout(() => setPressed((p) => (p === dir ? null : p)), 140)
      act({ t: 'turn', id: me, dir })
    },
    [playing, act, me],
  )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.key]
      if (d === undefined || e.metaKey || e.ctrlKey) return
      e.preventDefault()
      if (!e.repeat) steer(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [steer])
  // a buzz when you crash or win a round
  const crashed = !!mine && !mine.alive && game.phase !== 'countdown' && mine.path.length > 0
  useEffect(() => {
    if (crashed) buzz([70, 40, 70])
  }, [crashed])
  useEffect(() => {
    if (game.phase === 'roundEnd' && game.roundWinner === me) buzz([30, 50, 30, 50, 90])
  }, [game.phase, game.roundWinner, me])

  const ms = useCountdown(deadline, game.phase === 'countdown')
  return (
    <div className="tb-arena">
      <div className="tb-stage">
        <div className="tb-boardwrap">
          <Board game={game} me={me} onSwipe={playing ? steer : undefined} />
          <AnimatePresence>
            {game.phase === 'countdown' && (
              <motion.div key={`cd-${game.round}`} className="tb-over" initial={{ clipPath: 'circle(0% at 50% 50%)' }} animate={{ clipPath: 'circle(75% at 50% 50%)' }} exit={{ clipPath: 'circle(0% at 50% 50%)' }} transition={{ duration: 0.45, ease: EASE }}>
                <span className="tb-over__k">Round {game.round}</span>
                <AnimatePresence mode="popLayout">
                  <motion.b key={Math.ceil(ms / 1000)} className="tb-count" initial={{ rotateX: -90, y: 40 }} animate={{ rotateX: 0, y: 0 }} exit={{ rotateX: 90, y: -40 }} transition={SPRING}>
                    {ms > 250 ? Math.ceil(ms / 1000) : 'Go!'}
                  </motion.b>
                </AnimatePresence>
              </motion.div>
            )}
            {game.phase === 'roundEnd' && <RoundBanner key={`re-${game.round}`} game={game} me={me} />}
          </AnimatePresence>
          <AnimatePresence>
            {crashed && game.phase === 'run' && (
              <motion.div className="tb-out" initial={{ y: 70 }} animate={{ y: 0 }} exit={{ y: 70 }} transition={SPRING}>
                {crashText(mine!, game, me)} Watching the rest.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {mine && <Pad pressed={pressed} onDir={steer} disabled={!playing} />}
      </div>
      <aside className="tb-side">
        <div className="tb-side__head">
          <span className="pl-kicker">Round {game.round} · first to {game.goal}</span>
          <span className="tb-keys">Arrows or WASD · swipe on phones</span>
        </div>
        <Scores game={game} me={me} />
        <Feed game={game} me={me} />
      </aside>
    </div>
  )
}

function crashText(p: Player, g: Game, me: string): string {
  const you = p.id === me
  const who = you ? 'You' : p.name
  if (p.crash === 'wall') return `${who} hit the fence.`
  if (p.crash === 'self') return `${who} ran into ${you ? 'your' : 'their'} own trail.`
  if (p.crash === 'head') return `${who} met someone head-on.`
  const by = g.players.find((q) => q.id === p.crash)
  return by ? `${who} ran into ${by.id === me ? 'your' : `${by.name}’s`} trail.` : `${who} crashed.`
}

function Pad({ pressed, onDir, disabled }: { pressed: Dir | null; onDir: (d: Dir) => void; disabled: boolean }) {
  const btn = (d: Dir, cls: string, label: string) => (
    <motion.button
      type="button"
      className={`tb-pad__b ${cls}`}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault()
        onDir(d)
      }}
      animate={{ scale: pressed === d ? 0.86 : 1 }}
      transition={{ type: 'spring', stiffness: 700, damping: 20 }}
    >
      <svg viewBox="0 0 24 24" aria-hidden style={{ rotate: `${d * 90}deg` }}><path d="M5 15 L12 8 L19 15" /></svg>
    </motion.button>
  )
  return (
    <div className="tb-pad" role="group" aria-label="Steering pad">
      {btn(0, 'is-n', 'Up')}
      {btn(3, 'is-w', 'Left')}
      {btn(1, 'is-e', 'Right')}
      {btn(2, 'is-s', 'Down')}
    </div>
  )
}

function Pips({ n, of, color }: { n: number; of: number; color: string }) {
  return (
    <span className="tb-pips" aria-label={`${n} of ${of} rounds`}>
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} viewBox="0 0 16 18" width="14">
          <path d="M3 17 V2" className="tb-pip__pole" />
          <motion.path d="M3 2 L14 5.5 L3 9 Z" initial={false} animate={{ scale: i < n ? 1 : 0.55, fill: i < n ? color : 'rgba(0,0,0,0)' }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} style={{ originX: 0.2, originY: 0.3 }} className="tb-pip__flag" />
        </svg>
      ))}
    </span>
  )
}

function Scores({ game, me }: { game: Game; me: string }) {
  const list = ranking(game)
  return (
    <ol className="tb-scores">
      <LayoutGroup>
        {list.map((p) => (
          <motion.li layout transition={SPRING} key={p.id} className={`${p.id === me ? 'is-me' : ''} ${!p.alive && game.phase === 'run' ? 'is-out' : ''}`}>
            <Marker m={p.marker} size={26} />
            <span className="tb-scores__who">
              <b>{p.name}{p.id === me ? ' (you)' : ''}</b>
              <small>{status(p, game)}</small>
            </span>
            <Pips n={p.score} of={game.goal} color={mk(p.marker).color} />
          </motion.li>
        ))}
      </LayoutGroup>
    </ol>
  )
}

function status(p: Player, g: Game): string {
  if (p.away) return 'left'
  if (g.phase === 'countdown') return p.alive ? 'on the line' : 'next round'
  if (!p.alive) return p.path.length ? 'out this round' : 'next round'
  if (p.boost > 0) return 'fast-forward'
  if (p.ghost > 0) return 'stashed'
  return 'blazing'
}

/** The last few crashes and pickups, newest on top. */
function Feed({ game, me }: { game: Game; me: string }) {
  const name = (id: string) => (id === me ? 'You' : game.players.find((p) => p.id === id)?.name ?? 'Someone')
  const line = (e: Ev) => {
    if (e.t === 'pick') return `${name(e.who)} picked up ${e.kind === 'boost' ? 'fast-forward' : e.kind === 'ghost' ? 'stash' : 'revert'}`
    const p = game.players.find((q) => q.id === e.who)
    return p ? crashText({ ...p, crash: e.by ?? null }, game, me).replace(/\.$/, '') : 'Crash'
  }
  const items = [...game.events].reverse().slice(0, 5)
  return (
    <ul className="tb-feed" aria-live="polite">
      <AnimatePresence initial={false}>
        {items.map((e) => {
          const p = game.players.find((q) => q.id === e.who)
          return (
            <motion.li key={e.id} layout initial={{ x: 40, clipPath: 'inset(0% 0% 0% 100%)' }} animate={{ x: 0, clipPath: 'inset(0% 0% 0% 0%)' }} exit={{ clipPath: 'inset(0% 100% 0% 0%)' }} transition={{ duration: 0.35, ease: EASE }}>
              {p && <Marker m={p.marker} size={16} />}
              <span>{line(e)}</span>
            </motion.li>
          )
        })}
      </AnimatePresence>
      {!items.length && <li className="tb-feed__empty">Crashes and pickups show up here.</li>}
    </ul>
  )
}

function RoundBanner({ game, me }: { game: Game; me: string }) {
  const w = game.players.find((p) => p.id === game.roundWinner)
  return (
    <motion.div className="tb-over is-banner" initial={{ clipPath: 'inset(50% 0% 50% 0%)' }} animate={{ clipPath: 'inset(0% 0% 0% 0%)' }} exit={{ clipPath: 'inset(50% 0% 50% 0%)' }} transition={{ duration: 0.45, ease: EASE }}>
      <motion.div className="tb-banner" style={{ background: w ? mk(w.marker).bg : 'var(--surface)' }} initial={{ y: 30, rotate: -4 }} animate={{ y: 0, rotate: -1.5 }} transition={{ ...SPRING, delay: 0.15 }}>
        {w && (
          <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 380, damping: 12, delay: 0.25 }}>
            <Marker m={w.marker} size={56} play />
          </motion.span>
        )}
        <span className="pl-kicker">Round {game.round}</span>
        <b>{w ? (w.id === me ? 'You take the round' : `${w.name} takes the round`) : 'Everyone crashed. No point this time.'}</b>
        {w && <Pips n={w.score} of={game.goal} color={mk(w.marker).color} />}
      </motion.div>
    </motion.div>
  )
}

/* ---------- podium ---------- */

function Podium({ game, me, isHost, hostName, onAgain, onLeave }: { game: Game; me: string; isHost: boolean; hostName: string; onAgain: () => void; onLeave: () => void }) {
  const ranked = ranking(game).filter((p) => !p.away)
  const winners = game.winners.map((id) => (id === me ? 'You' : game.players.find((p) => p.id === id)?.name)).filter(Boolean)
  const order = [ranked[1], ranked[0], ranked[2], ranked[3]].filter(Boolean) as Player[]
  const heights = [170, 120, 86, 60]
  useEffect(() => {
    if (game.winners.includes(me)) buzz([30, 60, 30, 60, 120])
  }, [game.winners, me])
  return (
    <div className="pl-podium">
      <Confetti />
      <div className="pl-podium__head">
        <span className="pl-kicker">Match over after {game.round} rounds</span>
        <h2 className="pl-title is-small">
          <span className="pl-title__w">
            <motion.span initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.2 }}>
              {winners.join(' and ')} {winners.length > 1 ? 'share it' : winners[0] === 'You' ? 'win' : 'wins'}
            </motion.span>
          </span>
        </h2>
      </div>
      <ol className="pl-steps">
        {order.map((p) => {
          const place = ranked.indexOf(p)
          return (
            <li key={p.id} className={`pl-step ${p.id === me ? 'is-me' : ''}`}>
              <motion.span className="pl-step__mark" initial={{ y: -260, rotate: -90 }} animate={{ y: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.6 + (3 - place) * 0.18 }}>
                <Marker m={p.marker} size={place === 0 ? 64 : 48} play={place === 0} />
              </motion.span>
              <motion.div className="pl-step__block" style={{ background: mk(p.marker).bg }} initial={{ height: 0 }} animate={{ height: heights[place] }} transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.2 + (3 - place) * 0.12 }}>
                <b className="mono">{place + 1}</b>
              </motion.div>
              <span className="pl-step__name">{p.name}</span>
              <small className="pl-muted">{p.score} {p.score === 1 ? 'round' : 'rounds'} · trapped {p.boxed}</small>
            </li>
          )
        })}
      </ol>
      <div className="pl-row pl-podium__go">
        <button className="pl-btn" onClick={onLeave}>Leave</button>
        {isHost ? (
          <motion.button className="pl-btn is-solid" onClick={onAgain} whileTap={{ scale: 0.96 }}><span>Race again</span><span aria-hidden>→</span></motion.button>
        ) : (
          <span className="pl-muted">{hostName} can start a rematch</span>
        )}
      </div>
    </div>
  )
}

function Confetti() {
  const reduce = useReducedMotion()
  const bits = useMemo(() => Array.from({ length: 36 }, (_, i) => ({ i, x: Math.random() * 100, d: 2.6 + Math.random() * 2.2, delay: Math.random() * 1.2, r: (Math.random() - 0.5) * 720, m: MARKER_IDS[i % MARKER_IDS.length], s: 8 + Math.random() * 10 })), [])
  if (reduce) return null
  return (
    <div className="pl-confetti" aria-hidden>
      {bits.map((b) => (
        <motion.span key={b.i} style={{ left: `${b.x}%`, width: b.s, height: b.s * (b.i % 3 ? 1 : 0.5), background: mk(b.m).color, borderRadius: b.i % 2 ? '50%' : 3 }} initial={{ y: '-10vh', rotate: 0 }} animate={{ y: '110vh', rotate: b.r }} transition={{ duration: b.d, delay: b.delay, ease: 'easeIn', repeat: 1, repeatDelay: 0.4 }} />
      ))}
    </div>
  )
}
