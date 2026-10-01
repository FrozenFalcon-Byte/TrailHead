import Lenis from 'lenis'
import { useCallback, useEffect, useRef } from 'react'
import '../landing/landing.css'
import { Climb } from '../landing/Climb'
import { Hero } from '../landing/Hero'
import { Nav } from '../landing/Nav'
import { Lost } from '../landing/Lost'
import { Signposts } from '../landing/Signposts'
import { Faq, Footer, HowItWorks, Quote, Receipts, Rules } from '../landing/Sections'
import { Statement } from '../landing/Statement'
import { ChevronWipe, Rise } from '../motion/Wipe'

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
  const jump = useCallback((id: string) => {
    const target = id === 'top' ? 0 : (document.getElementById(id) as HTMLElement | null)
    if (target !== null) lenis.current?.scrollTo(target, { offset: 0, duration: 1.6 })
  }, [])
  return (
    <main className="l-flow">
      <Nav onJump={jump} settled={settled} />
      <Hero ready={ready} settled={settled} />
      <Statement />
      <ChevronWipe from="var(--paper)" to="var(--lilac)" label="Mile 1 →" />
      <Lost />
      <Signposts />
      <Rise as="div"><Climb /></Rise>
      <HowItWorks />
      <Quote />
      <Receipts />
      <Rules />
      <Faq />
      <Footer onJump={jump} />
    </main>
  )
}
