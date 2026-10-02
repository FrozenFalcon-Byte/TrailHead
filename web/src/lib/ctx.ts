import { useEffect, type RefObject } from 'react'

/* Components can add their own entries to the right-click menu for an element (a repository tile, a saved
   tour, a file path). The menu walks up from what was clicked and collects every registered group. */

export type CtxItem = {
  label: string
  hint?: string
  icon?: string
  run?: () => void
  href?: string
  danger?: boolean
  disabled?: boolean
  children?: CtxItem[]
}
export type CtxGroup = { title?: string; items: CtxItem[] }

const registry = new WeakMap<Element, () => CtxGroup>()

export function registerCtx(el: Element, get: () => CtxGroup) {
  registry.set(el, get)
  return () => {
    registry.delete(el)
  }
}

export function useCtx(ref: RefObject<Element | null>, get: () => CtxGroup, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    return registerCtx(el, get)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

export function registeredGroups(from: Element | null): CtxGroup[] {
  const out: CtxGroup[] = []
  for (let el: Element | null = from; el; el = el.parentElement) {
    const get = registry.get(el)
    if (get) out.push(get())
  }
  return out
}
