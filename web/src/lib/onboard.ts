import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

/* The welcome walk-through shows once per account. Signed-in accounts keep the flag in their user metadata so it
   follows them to any browser; local mode (no Supabase) keeps it in this browser. */

const KEY = 'th-onboarded'

export function isOnboarded(user: User | null): boolean {
  if (user?.user_metadata?.onboarded) return true
  try {
    return localStorage.getItem(KEY) === (user?.id ?? 'local')
  } catch {
    return false
  }
}

export async function markOnboarded(user: User | null) {
  try {
    localStorage.setItem(KEY, user?.id ?? 'local')
  } catch {
    /* private mode */
  }
  if (supabase && user) await supabase.auth.updateUser({ data: { onboarded: true } }).catch(() => undefined)
}

/** Show the walk-through again (from Settings or Help). */
export async function resetOnboarded(user: User | null) {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
  if (supabase && user) await supabase.auth.updateUser({ data: { onboarded: false } }).catch(() => undefined)
}
