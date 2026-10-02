import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import '@fontsource/caveat/600.css'
import { useMotionValue, useMotionValueEvent, useScroll } from 'motion/react'
import { memo, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { scrollToTarget, useSmoothScroll } from '../motion/SmoothScroll'
import { CHAPTERS } from './chapters'
import './guide.css'
import { initGuide } from './init'
import { Journey } from './Journey'
import { MARKUP } from './markup'
import { Side } from './Side'
import { Story } from './Story'

/* The field guide: how Trailhead works, chapter by chapter, with live pieces built on real traces from the cache.
   It opens with a scroll-built story (mountain, river, forest, trail), then the chapters follow with the journey
   strip pinned above them, walking the flag from landmark to landmark as you read. The chapter markup is static
   and init.ts wires it up, so the page stays one plain document that is easy to edit. */
export default function Guide() {
  const doc = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const pos = useMotionValue(0)
  const [active, setActive] = useState(0)
  const tops = useRef<number[]>([])
  const { scrollY } = useScroll()
  useSmoothScroll(true)

  useEffect(() => {
    const el = doc.current
    if (!el) return
    const title = document.title
    document.title = 'Field guide · Trailhead'
    const stop = initGuide(el, (to) => navigate(to))
    return () => {
      stop()
      document.title = title
      el.innerHTML = MARKUP // back to the untouched markup, so a second mount (Strict Mode) starts clean
    }
  }, [navigate])

  // Chapter positions on the page, kept fresh as panels open, flip and resize.
  useEffect(() => {
    const el = doc.current
    if (!el) return
    const measure = () => {
      tops.current = CHAPTERS.map((c) => {
        const s = el.querySelector<HTMLElement>(`#${c.id}`)
        return s ? s.getBoundingClientRect().top + window.scrollY : 0
      })
      track(window.scrollY)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    if (location.hash) {
      const i = CHAPTERS.findIndex((c) => `#${c.id}` === location.hash)
      if (i >= 0) window.setTimeout(() => jump(i, true), 60)
    }
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const band = () => (document.querySelector<HTMLElement>('.fg-journey')?.offsetHeight ?? 160) + 28

  function track(y: number) {
    const t = tops.current
    if (!t.length) return
    const at = y + band() + 60
    let i = 0
    while (i < t.length - 1 && at >= t[i + 1]) i++
    const end = i < t.length - 1 ? t[i + 1] : Math.max(t[i] + 1, document.documentElement.scrollHeight - window.innerHeight + band() + 60)
    const f = Math.min(1, Math.max(0, (at - t[i]) / Math.max(1, end - t[i])))
    pos.set(at < t[0] ? 0 : i + f)
    setActive((cur) => (cur === i ? cur : i))
  }
  useMotionValueEvent(scrollY, 'change', track)

  function jump(i: number, instant = false) {
    const el = doc.current?.querySelector<HTMLElement>(`#${CHAPTERS[i].id}`)
    if (!el) return
    if (instant) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - band() })
    else scrollToTarget(el, band())
    history.replaceState(null, '', `#${CHAPTERS[i].id}`)
  }

  return (
    <div className="fg">
      <div className="fg-shell">
        <Side active={active} onJump={(i) => jump(i)} />
        <main className="fg-main">
          <Story />
          <div className="fg-body">
            <Journey pos={pos} active={active} />
            <Doc ref={doc} />
          </div>
        </main>
      </div>
    </div>
  )
}

/** The static chapters. Memoised so React never touches the markup that init.ts has wired up. */
const Doc = memo(function Doc({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  return <div className="fg-doc" ref={ref} dangerouslySetInnerHTML={{ __html: MARKUP }} />
})
