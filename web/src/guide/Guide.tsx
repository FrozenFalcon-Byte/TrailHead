import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/inter'
import '@fontsource/caveat/600.css'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './guide.css'
import { initGuide } from './init'
import { MARKUP } from './markup'

/* The field guide: how Trailhead works, chapter by chapter, with live pieces built on real traces from the cache.
   The markup is static and init.ts wires it up, so the page stays one plain document that is easy to edit. */
export default function Guide() {
  const root = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const el = root.current
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
  return <div className="fg" ref={root} dangerouslySetInnerHTML={{ __html: MARKUP }} />
}
