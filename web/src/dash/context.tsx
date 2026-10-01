import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api } from '../lib/api'

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
  error?: string
}
export type Health = { ok: boolean; auth: string; engines: string[]; default_engine: string; next_slot_s: number }

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
  /** Poll the API now instead of waiting for the next 15s tick. */
  recheck: () => Promise<void>
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
  const [slotAt, setSlotAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  const refreshRepos = useCallback(async () => {
    const list = await api<RepoInfo[]>('/api/repos')
    setRepos(list)
    setRepoState((current) => (current && list.some((r) => r.repo === current) ? current : list.find((r) => r.status === 'ready')?.repo || ''))
  }, [])

  const poll = useCallback(async () => {
    try {
      const h = await api<Health>('/api/health')
      setHealth(h)
      setOffline(false)
      setSlotAt(Date.now() + h.next_slot_s * 1000)
    } catch {
      setOffline(true)
    }
  }, [])
  const recheck = useCallback(async () => {
    await poll()
    await refreshRepos().catch(() => setOffline(true))
  }, [poll, refreshRepos])

  useEffect(() => {
    recheck()
    const id = setInterval(poll, 15000)
    return () => clearInterval(id)
  }, [poll, recheck])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const value = useMemo<DashState>(
    () => ({
      repos,
      repo,
      setRepo: (r) => {
        setRepoState(r)
        write('th-repo', r)
      },
      engine: engine || health?.default_engine || 'jev',
      setEngine: (e) => {
        setEngineState(e)
        write('th-engine', e)
      },
      health,
      offline,
      nextSlot: Math.max(0, (slotAt - now) / 1000),
      noteSlot: (s) => setSlotAt(Date.now() + s * 1000),
      refreshRepos,
      recheck,
    }),
    [repos, repo, engine, health, offline, slotAt, now, refreshRepos, recheck],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useDash(): DashState {
  const c = useContext(Ctx)
  if (!c) throw new Error('useDash outside DashProvider')
  return c
}
