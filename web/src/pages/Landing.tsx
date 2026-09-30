import Lenis from 'lenis'
import { useCallback, useEffect, useRef } from 'react'
import '../landing/landing.css'
import { Hero } from '../landing/Hero'
import { Nav } from '../landing/Nav'
import { Cta, Faq, Footer, HowItWorks, Mosaic, NoGuesswork, Quote, Receipts, Rules, Statement } from '../landing/Sections'

export default function Landing({ ready }: { ready: boolean }) {
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
    <main>
      <Nav onJump={jump} />
      <Hero ready={ready} />
      <Statement />
      <NoGuesswork />
      <Quote />
      <HowItWorks />
      <Mosaic />
      <Receipts />
      <Rules />
      <Faq />
      <Cta />
      <Footer onJump={jump} />
    </main>
  )
}
