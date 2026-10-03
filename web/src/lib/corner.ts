import { useCallback, useEffect, useSyncExternalStore } from 'react'

/* The bottom-left corner holds whatever has been minimised (the server wake-up toast, the new-version chip). Each one
   takes a slot when it appears; later ones stack above earlier ones, and when one leaves the ones above slide down.
   A slot's offset is how far above the corner's base it sits. */

export const CORNER_GAP = 10
const order: string[] = []
const heights = new Map<string, number>()
const subs = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  subs.forEach((f) => f())
}

/** How far above the base `id` sits: the stack below it, or the whole stack if it has no slot yet (where it would go). */
export function cornerOffset(id: string) {
  const i = order.indexOf(id)
  const below = i < 0 ? order : order.slice(0, i)
  return below.reduce((sum, k) => sum + (heights.get(k) ?? 0) + CORNER_GAP, 0)
}

/** Take a slot while `present`; returns this one's offset and a ref that measures it. */
export function useCornerSlot(id: string, present: boolean) {
  useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => version,
  )
  useEffect(() => {
    if (!present) return
    if (!order.includes(id)) {
      order.push(id)
      emit()
    }
    return () => {
      const i = order.indexOf(id)
      if (i >= 0) order.splice(i, 1)
      emit()
    }
  }, [id, present])
  const measure = useCallback(
    (el: HTMLElement | null) => {
      if (!el || heights.get(id) === el.offsetHeight) return
      heights.set(id, el.offsetHeight)
      emit()
    },
    [id],
  )
  return { offset: cornerOffset(id), measure }
}
