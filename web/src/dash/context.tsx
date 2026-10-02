import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '../lib/api'
import { toast } from '../lib/toast'
import { isHosted, suspectSleep, useWake } from '../lib/wake'

export type RepoInfo = {
  repo: string
  status: string
  head?: string
  files?: number
  tests?: number
  symbols?: number
  commits?: number
  pull_requests?: number
  issues?: number
  comments?: number
  links?: number
  annotated_files?: number
  step?: string
  github_note?: string
  snapshot_note?: string
  kept?: boolean | null
  replaced?: string[]
  error?: string
}
export type Health = { ok: boolean; auth: string; engines: string[]; default_engine: string; next_slot_s: number; snapshots?: string }
export type ServerConfig = {
  default_engine: string
  engines: string[]
  offline: boolean
  auth: string
  jev: { model_id: string; max_concurrency: number; providers: { name: string; model: string; rpm: number; host: string }[] }
  llm: { configured: boolean; model: string; host: string; rpm: number; reasoning_effort: string; fallback_model: string }
  local: { model: string; host: string }
  github_token: boolean
  repos: number
}

type DashState = {
  repos: RepoInfo[]
  repo: string
  setRepo: (r: string) => void
  engine: string
  setEngine: (e: string) => void
  health: Health | null
  offline: boolean
  nextSlot: number
  noteSlot: (s: number) => void
  refreshRepos: () => Promise<void>
  /** Poll the API now instead of waiting for the next tick. Resolves with whether it answered. */
  recheck: () => Promise<boolean>
  checking: boolean
  lastCheck: number
  config: ServerConfig | null
}

const Ctx = createContext<DashState | null>(null)
const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) || d
  } catch {
    return d
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

export function DashProvider({ children }: { children: ReactNode }) {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [repo, setRepoState] = useState(read('th-repo', ''))
  const [engine, setEngineState] = useState(read('th-engine', ''))
  const [health, setHealth] = useState<Health | null>(null)
  const [offline, setOffline] = useState(false)
  const [checking, setChecking] = useState(false)
  const [lastCheck, setLastCheck] = useState(0)
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const was = useRef<boolean | null>(null)
  const [slotAt, setSlotAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  const refreshRepos = useCallback(async () => {
    const raw = await api<RepoInfo[]>('/api/repos')
    // one entry per repository; a running job wins over a half-written database
    const by = new Map<string, RepoInfo>()
    raw.forEach((r) => { const had = by.get(r.repo); if (!had || r.status === 'running') by.set(r.repo, r) })
    const list = [...by.values()]
    setRepos(list)
    setRepoState((current) => (current && list.some((r) => r.repo === current) ? current : list.find((r) => r.status === 'ready')?.repo || ''))
  }, [])

  const poll = useCallback(async (): Promise<boolean> => {
    let up = false
    try {
      const h = await api<Health>('/api/health')
      setHealth(h)
      setSlotAt(Date.now() + h.next_slot_s * 1000)
      up = true
    } catch {
      up = false
    }
    setOffline(!up)
    setLastCheck(Date.now())
    // Say so when the connection changes, not on every poll. A hosted API that stops answering has most likely
    // gone to sleep, which the wake sheet tells better than a toast.
    if (was.current !== null && was.current !== up && !up) {
      suspectSleep()
      if (!isHosted) toast({ key: 'api-lost', tone: 'error', title: 'Lost the API', body: 'Start it again with bin/trailhead serve. Checking every few seconds.' })
    }
    if (up && was.current !== true) api<ServerConfig>('/api/config').then(setConfig, () => undefined)
    was.current = up
    return up
  }, [])
  const recheck = useCallback(async () => {
    setChecking(true)
    // Keep the spinner up long enough to read, even when the answer is instant.
    const [up] = await Promise.all([poll(), new Promise((r) => setTimeout(r, 650))])
    if (up) await refreshRepos().catch(() => undefined)
    setChecking(false)
    return up
  }, [poll, refreshRepos])

  useEffect(() => {
    poll().then((up) => { if (up) refreshRepos().catch(() => undefined) })
  }, [poll, refreshRepos])
  // Poll every 15s while connected, every 4s while the API is down so it reconnects quickly.
  useEffect(() => {
    const id = setInterval(async () => {
      const up = await poll()
      if (up && offline) refreshRepos().catch(() => undefined)
    }, offline ? 4000 : 15000)
    return () => clearInterval(id)
  }, [poll, offline, refreshRepos])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  // When the host finishes waking, fetch everything at once rather than waiting for the next tick.
  const wake = useWake()
  useEffect(() => {
    if (wake.phase === 'awake' || wake.phase === 'up') recheck().catch(() => undefined)
  }, [wake.phase === 'awake' || wake.phase === 'up'])
  const sleeping = wake.phase === 'checking' || wake.phase === 'waking'

  const value = useMemo<DashState>(
    () => ({
      repos,
      repo,
      setRepo: (r) => {
        // a deliberate move between two repositories gets the full-screen arrival in RepoSplash
        if (repo && r && r !== repo) window.dispatchEvent(new CustomEvent('th:switch', { detail: { from: repo, to: r } }))
        setRepoState(r)
        write('th-repo', r)
      },
      engine: engine || health?.default_engine || 'jev',
      setEngine: (e) => {
        setEngineState(e)
        write('th-engine', e)
      },
      health,
      offline: offline && !sleeping,
      nextSlot: Math.max(0, (slotAt - now) / 1000),
      noteSlot: (s) => setSlotAt(Date.now() + s * 1000),
      refreshRepos,
      recheck,
      checking,
      lastCheck,
      config,
    }),
    [repos, repo, engine, health, offline, sleeping, slotAt, now, refreshRepos, recheck, checking, lastCheck, config],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDash(): DashState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDash outside DashProvider')
  return c
}
