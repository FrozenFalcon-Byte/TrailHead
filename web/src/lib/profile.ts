import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from './auth'
import { getPrefs, sanitize, setPrefs, subscribePrefs } from './prefs'
import { supabase } from './supabase'

/* The signed-in person's profile row (public.profiles), shared by every screen so a new photo or name shows up
   everywhere at once. Columns added by migration 0002 are optional: if it has not been run yet, the basics still
   work and `upgraded` says so. */

export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  github_login: string | null
  headline?: string | null
  bio?: string | null
  website?: string | null
  location?: string | null
  settings?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}
const EXTRAS = ['headline', 'bio', 'website', 'location'] as const
type State = { profile: Profile | null; loading: boolean; upgraded: boolean; error: string }

/* Local mode (no Supabase) keeps the profile in this browser so the page still works end to end. */
const LOCAL_PROFILE = 'th-local-profile'
function localProfile(): Profile | null {
  if (supabase) return null
  try {
    return { id: 'local', display_name: null, avatar_url: null, github_login: null, ...JSON.parse(localStorage.getItem(LOCAL_PROFILE) || '{}') }
  } catch {
    return { id: 'local', display_name: null, avatar_url: null, github_login: null }
  }
}

let state: State = { profile: localProfile(), loading: false, upgraded: true, error: '' }
let loadedFor = ''
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

async function load(id: string) {
  if (!supabase) return
  set({ loading: true, error: '' })
  let { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (error) set({ error: error.message })
  if (!data && !error) {
    // Accounts made before the trigger existed have no row yet.
    const made = await supabase.from('profiles').upsert({ id }).select('*').maybeSingle()
    data = made.data
  }
  const p = (data ?? { id, display_name: null, avatar_url: null, github_login: null }) as Profile
  const upgraded = 'settings' in p
  // Without migration 0002 the extra fields live on the account's metadata instead, so the page still works.
  if (!upgraded) {
    const meta = ((await supabase.auth.getUser()).data.user?.user_metadata ?? {}) as Record<string, string | undefined>
    for (const k of EXTRAS) p[k] = meta[`profile_${k}`] ?? null
  }
  set({ profile: p, loading: false, upgraded })
  // Settings follow the account when the person turned sync on from another device.
  const synced = p.settings as Record<string, unknown> | null | undefined
  if (synced && synced.syncToAccount === true) setPrefs(sanitize(synced))
}

export function useProfile(): State & { reload: () => void } {
  const { user } = useAuth()
  const s = useSyncExternalStore(subscribe, () => state, () => state)
  useEffect(() => {
    if (!user || loadedFor === user.id) return
    loadedFor = user.id
    load(user.id)
  }, [user])
  return { ...s, reload: () => user && load(user.id) }
}

/** The profile row, loading it first if no screen has asked for it yet. */
async function ensureProfile(): Promise<Profile> {
  if (!supabase) throw new Error('Sign-in is not configured.')
  if (state.profile) return state.profile
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('You are signed out. Sign in again to change your profile.')
  await load(data.user.id)
  if (!state.profile) throw new Error('Could not load your profile.')
  return state.profile
}

export async function saveProfile(patch: Partial<Profile>): Promise<void> {
  if (!supabase) {
    const next = { ...(state.profile as Profile), ...patch, avatar_url: null }
    try {
      localStorage.setItem(LOCAL_PROFILE, JSON.stringify(next))
    } catch {
      /* storage blocked: kept for this visit */
    }
    return set({ profile: next })
  }
  const { id } = await ensureProfile()
  const clean = { ...patch }
  if (!state.upgraded) {
    const meta: Record<string, string | null> = {}
    for (const k of EXTRAS) if (k in clean) meta[`profile_${k}`] = clean[k] ?? null
    if (Object.keys(meta).length) {
      const { error } = await supabase.auth.updateUser({ data: meta })
      if (error) throw error
    }
    for (const k of [...EXTRAS, 'settings'] as const) delete clean[k]
  }
  // Upsert, so an account whose row was never created still saves.
  const { data, error } = await supabase.from('profiles').upsert({ id, ...clean, updated_at: new Date().toISOString() }).select('*').single()
  if (error) throw error
  set({ profile: state.upgraded ? (data as Profile) : { ...(data as Profile), ...Object.fromEntries(EXTRAS.map((k) => [k, k in patch ? patch[k] ?? null : state.profile?.[k] ?? null])) } })
  if ('display_name' in patch || 'avatar_url' in patch) {
    // Mirror onto the auth user too, so the name and photo travel with the session.
    const meta: Record<string, string> = {}
    if (patch.display_name != null) meta.full_name = patch.display_name
    if (patch.avatar_url != null && !patch.avatar_url.startsWith('data:')) meta.avatar_url = patch.avatar_url
    if (Object.keys(meta).length) await supabase.auth.updateUser({ data: meta })
  }
}

/* Local mode (no Supabase) keeps the photo in this browser. */
const LOCAL = 'th-local-avatar'
let localCache: string | null = null
function readLocal(): string {
  if (localCache === null) {
    try {
      localCache = localStorage.getItem(LOCAL) || ''
    } catch {
      localCache = ''
    }
  }
  return localCache
}
function setLocalAvatar(url: string) {
  localCache = url
  try {
    if (url) localStorage.setItem(LOCAL, url)
    else localStorage.removeItem(LOCAL)
  } catch {
    /* storage full or blocked: it still shows for this visit */
  }
  listeners.forEach((l) => l())
}

/** Upload a cropped photo. Uses the `avatars` bucket from migration 0002; without it, a small copy is kept
 *  inline on the profile row so the feature still works. */
export async function uploadAvatar(blob: Blob, small: string): Promise<string> {
  if (!supabase) {
    setLocalAvatar(small)
    return 'local'
  }
  const profile = await ensureProfile()
  const path = `${profile.id}/avatar-${Date.now()}.webp`
  const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' })
  let url = small
  if (!up.error) {
    url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
    const old = profile.avatar_url
    const marker = '/object/public/avatars/'
    if (old?.includes(marker)) supabase.storage.from('avatars').remove([old.split(marker)[1]]).then(() => undefined, () => undefined)
  }
  await saveProfile({ avatar_url: url })
  return up.error ? 'inline' : 'storage'
}

export async function removeAvatar(): Promise<void> {
  if (!supabase) return setLocalAvatar('')
  const old = (await ensureProfile()).avatar_url
  const marker = '/object/public/avatars/'
  if (old?.includes(marker)) await supabase.storage.from('avatars').remove([old.split(marker)[1]])
  await saveProfile({ avatar_url: '' })
  await supabase.auth.updateUser({ data: { avatar_url: '' } })
}

/** The photo to show: the profile's own, else whatever the sign-in provider sent. */
export function useAvatar(): string {
  const { avatar } = useAuth()
  const { profile } = useProfile()
  const local = useSyncExternalStore(subscribe, readLocal, readLocal)
  if (!supabase) return local
  if (profile && profile.avatar_url !== null) return profile.avatar_url || ''
  return avatar
}

/* Settings sync: while it is on, every change is written to the profile (debounced). */
let timer = 0
let started = false
export function startSettingsSync() {
  if (started) return
  started = true
  subscribePrefs(() => {
    const p = getPrefs()
    if (!state.profile || !state.upgraded) return
    const was = (state.profile.settings as Record<string, unknown> | null)?.syncToAccount === true
    if (!p.syncToAccount && !was) return
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      saveProfile({ settings: p.syncToAccount ? { ...p } : { syncToAccount: false } }).catch(() => undefined)
    }, 900)
  })
}
