import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { useEffect } from 'react'

/* Eased wheel and trackpad scrolling for the dashboard. It still moves the real page scroll, so sticky bars and
   CSS scroll-driven animations keep working. Dialogs, menus and any box that scrolls on its own are left native. */

let lenis: Lenis | null = null

export function useSmoothScroll(on: boolean) {
  useEffect(() => {
    if (!on || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    lenis = new Lenis({
      autoRaf: true,
      lerp: 0.11,
      wheelMultiplier: 0.95,
      allowNestedScroll: true,
      prevent: (node) => !!node.closest?.('[role=dialog], [role=listbox], [role=menu], .ae, .qs, textarea'),
    })
    return () => {
      lenis?.destroy()
      lenis = null
    }
  }, [on])
}

/** Jump to the top without easing (page switches). */
export function scrollTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true, force: true })
  else window.scrollTo({ top: 0 })
}

/** Glide to an element (or a page offset), leaving `offset` pixels above it. */
export function scrollToTarget(target: HTMLElement | number, offset = 0) {
  if (lenis) lenis.scrollTo(target, { offset: -offset, duration: 1.3 })
  else {
    const top = typeof target === 'number' ? target : target.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: top - offset, behavior: 'smooth' })
  }
}
