import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Local development only: run without Supabase. The API must then run with TRAILHEAD_AUTH=off. */
export const authBypass = import.meta.env.VITE_AUTH_BYPASS === '1'
export const supabaseConfigured = Boolean(url && anon)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' }, realtime: { params: { eventsPerSecond: 40 } } })
  : null
