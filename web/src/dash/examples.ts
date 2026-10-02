import { useEffect, useState } from 'react'
import { api } from '../lib/api'

/* Starter questions for Ask, Find and Tour. They come from the open repository's own index (its most imported
   files, the classes and functions in them, its folders), so they always name real code in this repository. The
   generic lines below only show while those load or if the index has nothing to offer. */

export type Starters = { ask: string[]; find: string[]; tour: string[] }

export const GENERIC: Starters = {
  ask: ['Where is the entry point of this project?', 'How is the code organised?', 'How do I run the test suite?', 'What are the main pieces and how do they talk?'],
  find: ['The entry point', 'Where configuration is loaded', 'Where errors are handled', 'The main loop'],
  tour: ['I want to understand how this project is put together.', 'I want to make a small first change safely.', 'I want to add a test for something that has none.'],
}

const cache = new Map<string, Starters>()

export function useStarters(repo: string): { starters: Starters; ready: boolean } {
  const [got, setGot] = useState<Starters | null>(() => cache.get(repo) ?? null)
  useEffect(() => {
    if (!repo) return
    const hit = cache.get(repo)
    if (hit) return setGot(hit)
    setGot(null)
    let live = true
    api<Starters>(`/api/suggest?repo=${encodeURIComponent(repo)}`)
      .then((s) => {
        cache.set(repo, s)
        if (live) setGot(s)
      })
      .catch(() => live && setGot({ ask: [], find: [], tour: [] }))
    return () => {
      live = false
    }
  }, [repo])
  const pick = (k: keyof Starters) => (got?.[k]?.length ? got[k] : GENERIC[k])
  return { starters: { ask: pick('ask'), find: pick('find'), tour: pick('tour') }, ready: got !== null }
}
