import { supabase } from './supabase'

/** Saved asks and tours. Supabase when configured (row-level security keeps each user's rows private);
 *  this browser's storage in local bypass mode. */
export type Saved<T> = { id: string; created_at: string; repo: string; title: string; payload: T }
type Table = 'asks' | 'tours'

const localKey = (t: Table) => `th-${t}`

function readLocal<T>(t: Table): Saved<T>[] {
  try {
    return JSON.parse(localStorage.getItem(localKey(t)) || '[]')
  } catch {
    return []
  }
}

export async function listSaved<T>(table: Table, repo: string, limit = 20): Promise<Saved<T>[]> {
  if (!supabase) return readLocal<T>(table).filter((r) => r.repo === repo).slice(0, limit)
  const { data, error } = await supabase.from(table).select('id, created_at, repo, title, payload').eq('repo', repo).order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as Saved<T>[]
}

export async function saveItem<T>(table: Table, repo: string, title: string, payload: T): Promise<Saved<T>> {
  if (!supabase) {
    const row: Saved<T> = { id: crypto.randomUUID(), created_at: new Date().toISOString(), repo, title, payload }
    try {
      localStorage.setItem(localKey(table), JSON.stringify([row, ...readLocal<T>(table)].slice(0, 50)))
    } catch {
      /* storage full or blocked: the result is still on screen */
    }
    return row
  }
  const { data: auth } = await supabase.auth.getUser()
  const { data, error } = await supabase.from(table).insert({ user_id: auth.user?.id, repo, title, payload }).select('id, created_at, repo, title, payload').single()
  if (error) throw error
  return data as Saved<T>
}

export async function deleteItem(table: Table, id: string): Promise<void> {
  if (!supabase) {
    try {
      localStorage.setItem(localKey(table), JSON.stringify(readLocal(table).filter((r) => r.id !== id)))
    } catch {
      /* ignore */
    }
    return
  }
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
}
