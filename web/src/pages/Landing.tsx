import Lenis from 'lenis'
import { useCallback, useEffect, useRef } from 'react'
import '../landing/landing.css'
import { Climb } from '../landing/Climb'
import { Hero } from '../landing/Hero'
import { Nav } from '../landing/Nav'
import { Lost } from '../landing/Lost'
import { Signposts } from '../landing/Signposts'
import { Faq, Footer, HowItWorks, Quote, Rules } from '../landing/Sections'
import { Receipts } from '../landing/ReceiptsMile'
import { Statement } from '../landing/Statement'
import { MileWipe } from '../motion/Wipe'

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
      <MileWipe kind="chevron" from="var(--paper)" to="var(--lilac)" label="Mile 1 →" />
      <Lost />
      <MileWipe kind="iris" from="var(--lime)" to="var(--peach)" label="Mile 2 →" />
      <Signposts />
      <MileWipe kind="shutters" from="var(--peach)" to="var(--peach)" label="Mile 3 →" />
      <Climb />
      <MileWipe kind="tiles" from="var(--mint)" to="var(--butter)" label="Mile 4 →" />
      <HowItWorks />
      <Quote />
      <MileWipe kind="stripes" from="var(--paper)" to="var(--sky)" label="Mile 5 →" />
      <Receipts />
      <MileWipe kind="doors" from="var(--sky)" to="var(--mint)" label="Mile 6 →" />
      <Rules />
      <MileWipe kind="ripple" from="var(--mint)" to="var(--peach)" label="Mile 7 →" />
      <Faq />
      <Footer onJump={jump} />
    </main>
  )
}
