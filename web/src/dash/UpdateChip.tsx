import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { usePref } from '../lib/prefs'
import { toast } from '../lib/toast'
import { useRelease } from '../lib/version'
import { LeavingSheet } from '../motion/UpdateSheet'
import { EASE } from './ui'

/* When a newer build of the dashboard is out, a chip appears in the top bar. It opens onto what changed and an
   Update button; updating walks a trail across a sheet that carries on through the reload into the new build. */

export function UpdateChip() {
  const release = useRelease()
  const notice = usePref('updateNotice')
  const [open, setOpen] = useState(false)
  const [going, setGoing] = useState(false)
  const told = useRef('')
  const box = useRef<HTMLDivElement>(null)

  const update = () => {
    setOpen(false)
    setGoing(true)
  }

  useEffect(() => {
    if (!release || told.current === release.id || notice === 'quiet') return
    told.current = release.id
    if (notice === 'auto' && document.visibilityState === 'hidden') return void window.location.reload()
    toast({ tone: 'info', title: 'A new version is ready', body: release.changes[0] ?? 'The dashboard was updated.', action: { label: 'Update', run: update }, ttl: 0 })
  }, [release, notice])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <>
      <AnimatePresence>
        {release && (
          <motion.div ref={box} className="up" initial={{ scale: 0.6, opacity: 0, x: 20 }} animate={{ scale: 1, opacity: 1, x: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 24 }}>
            <button className="up__chip" onClick={() => setOpen(!open)} aria-expanded={open} data-cursor="See what changed">
              <motion.svg width={16} height={16} viewBox="0 0 16 16" aria-hidden animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </motion.svg>
              New version
            </button>
            <AnimatePresence>
              {open && (
                <motion.div className="up__pop" initial={{ opacity: 0, y: -8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.22, ease: EASE }}>
                  <div className="up__head">
                    <span className="up__tag">Fresh trail</span>
                    <b>The dashboard changed since you opened it</b>
                  </div>
                  {release.changes.length > 0 && (
                    <ol className="up__list">
                      {release.changes.slice(0, 5).map((c, i) => (
                        <motion.li key={c + i} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.05 + i * 0.05 }}>{c}</motion.li>
                      ))}
                    </ol>
                  )}
                  <div className="up__go">
                    <button className="btn small" onClick={update}><span>Update now</span><span className="arrow">↻</span></button>
                    <button className="d-chip" onClick={() => setOpen(false)}>Later</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
      {going && <LeavingSheet changes={release?.changes ?? []} />}
    </>
  )
}
