import Lenis from 'lenis'
import { useCallback, useEffect, useRef, useState } from 'react'
import '../landing/landing.css'
import { Climb } from '../landing/Climb'
import { Hero } from '../landing/Hero'
import { Nav, SECTIONS } from '../landing/Nav'
import { Lost } from '../landing/Lost'
import { Signposts } from '../landing/Signposts'
import { Faq, Footer, HowItWorks, Quote, Rules } from '../landing/Sections'
import { Receipts } from '../landing/ReceiptsMile'
import { Statement } from '../landing/Statement'
import { JumpCover, type Hop } from '../motion/JumpCover'
import { MileEdge } from '../motion/Wipe'

export default function Landing({ ready, settled = true }: { ready: boolean; settled?: boolean }) {
  const lenis = useRef<Lenis | null>(null)
  useEffect(() => {
    const instance = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true })
    lenis.current = instance
    let frame = 0
    const raf = (time: number) => {
      instance.raf(time)
      frame = requestAnimationFrame(raf)
    }
    frame = requestAnimationFrame(raf)
    return () => {
      cancelAnimationFrame(frame)
      instance.destroy()
      lenis.current = null
    }
  }, [])
  useEffect(() => {
    if (!ready) lenis.current?.stop()
    else lenis.current?.start()
  }, [ready])
  // Nav and footer links teleport under a cover instead of scrolling through every scene on the way.
  const [hop, setHop] = useState<Hop | null>(null)
  const hops = useRef(0)
  const land = useCallback((id: string) => {
    const target = id === 'top' ? 0 : (document.getElementById(id) as HTMLElement | null)
    if (target !== null) lenis.current?.scrollTo(target, { offset: 0, immediate: true, force: true })
  }, [])
  const jump = useCallback(
    (id: string) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return land(id)
      const label = id === 'top' ? 'Trailhead' : (SECTIONS.find((s) => s.id === id)?.label ?? id)
      setHop({ id, label, n: ++hops.current })
    },
    [land],
  )
  const clearHop = useCallback(() => setHop(null), [])
  return (
    <main className="l-flow">
      <Nav onJump={jump} settled={settled} />
      <Hero ready={ready} settled={settled} />
      <Statement />
      <MileEdge kind="chevron" to="var(--lilac)" accent="var(--violet)" label="Mile 1" />
      <Lost />
      <MileEdge kind="arc" to="var(--peach)" accent="var(--orange)" label="Mile 2" />
      <Signposts />
      <MileEdge kind="pillars" to="var(--peach)" accent="var(--yellow)" label="Mile 3" />
      <Climb />
      <MileEdge kind="teeth" to="var(--butter)" accent="var(--green)" label="Mile 4" />
      <HowItWorks />
      <Quote />
      <MileEdge kind="slant" to="var(--sky)" accent="var(--blue)" label="Mile 5" />
      <Receipts />
      <MileEdge kind="peaks" to="var(--mint)" accent="var(--lime)" label="Mile 6" />
      <Rules />
      <MileEdge kind="wave" to="var(--peach)" accent="var(--violet)" label="Mile 7" />
      <Faq />
      <Footer onJump={jump} />
      <JumpCover hop={hop} onCovered={land} onDone={clearHop} />
    </main>
  )
}
