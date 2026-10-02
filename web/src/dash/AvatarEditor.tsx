import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Slider } from '../motion/Select'
import { TrailSpinner } from '../motion/TrailSpinner'
import { uploadAvatar } from '../lib/profile'
import { errorText, notify } from '../lib/toast'

/* Profile photo editor: drop or pick an image, drag it inside the round frame, zoom with the slider, the wheel
   or a pinch, rotate in quarter turns, and watch the previews update at the sizes the app really uses. Saving
   draws the crop onto a canvas (the original never leaves the browser) and uploads a 512px WebP. */

const V = 280
const EASE = [0.22, 1, 0.36, 1] as const
type Step = 'pick' | 'edit' | 'saving'

export function AvatarEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('pick')
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [over, setOver] = useState(false)
  const [preview, setPreview] = useState('')
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const pinch = useRef<{ d: number; z: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const file = useRef<HTMLInputElement>(null)

  // Reset only when the editor opens. Keying this on `onClose` as well reset it on every parent render (callers
  // pass an inline function), which threw away a freshly picked photo before it could be cropped.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    setStep('pick')
    setImg(null)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const dims = useCallback(() => {
    if (!img) return { w: 1, h: 1, s: 1 }
    const turned = rot % 180 !== 0
    const w = turned ? img.naturalHeight : img.naturalWidth
    const h = turned ? img.naturalWidth : img.naturalHeight
    return { w, h, s: (V / Math.min(w, h)) * zoom }
  }, [img, rot, zoom])

  const clamp = useCallback(
    (x: number, y: number) => {
      const { w, h, s } = dims()
      const mx = Math.max(0, (w * s - V) / 2)
      const my = Math.max(0, (h * s - V) / 2)
      return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)) }
    },
    [dims],
  )
  useEffect(() => setOff((o) => clamp(o.x, o.y)), [zoom, rot, clamp])

  const render = useCallback(
    (size: number, type = 'image/webp', quality = 0.9): Promise<Blob | null> | string => {
      if (!img) return ''
      const cv = document.createElement('canvas')
      cv.width = cv.height = size
      const g = cv.getContext('2d')!
      const k = size / V
      const s = (V / Math.min(rot % 180 ? img.naturalHeight : img.naturalWidth, rot % 180 ? img.naturalWidth : img.naturalHeight)) * zoom
      g.imageSmoothingQuality = 'high'
      g.translate(size / 2 + off.x * k, size / 2 + off.y * k)
      g.rotate((rot * Math.PI) / 180)
      g.scale(s * k, s * k)
      g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      if (size <= 160) return cv.toDataURL(type, quality)
      return new Promise((res) => cv.toBlob(res, type, quality))
    },
    [img, rot, zoom, off],
  )
  // Live previews, throttled to a frame.
  useEffect(() => {
    if (step !== 'edit') return
    const id = requestAnimationFrame(() => setPreview(render(128) as string))
    return () => cancelAnimationFrame(id)
  }, [render, step])

  const take = (f: File | undefined) => {
    if (!f) return
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/.test(f.type)) return notify.error('That is not an image', 'Use a PNG, JPEG, WebP, GIF or AVIF.')
    if (f.size > 15 * 1024 * 1024) return notify.error('That image is too big', 'Pick one under 15 MB.')
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setZoom(1)
      setRot(0)
      setOff({ x: 0, y: 0 })
      setStep('edit')
    }
    im.onerror = () => notify.error('Could not read that image')
    im.src = url
  }

  const save = async () => {
    setStep('saving')
    try {
      const blob = await (render(512) as Promise<Blob | null>)
      if (!blob) throw new Error('Could not draw the photo.')
      const where = await uploadAvatar(blob, render(128, 'image/webp', 0.85) as string)
      notify.ok('Profile photo updated', where === 'inline' ? 'Stored on your profile. Run migration 0002 to keep full-size photos in storage.' : where === 'local' ? 'Kept in this browser while you are in local mode.' : undefined)
      onClose()
    } catch (e) {
      notify.error('Photo not saved', errorText(e))
      setStep('edit')
    }
  }

  const down = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }
      drag.current = null
    } else drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }
  }
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      setZoom(Math.min(4, Math.max(1, (pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.d)))
    } else if (drag.current) setOff(clamp(drag.current.ox + e.clientX - drag.current.x, drag.current.oy + e.clientY - drag.current.y))
  }
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (!pointers.current.size) drag.current = null
  }

  const { s } = dims()
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="ae" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { delay: 0.1 } }} onClick={onClose}>
          <motion.div
            className="ae__card t-butter"
            role="dialog"
            aria-modal
            aria-label="Edit profile photo"
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 60, scale: 0.92, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.94, opacity: 0, transition: { duration: 0.22 } }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            layout
          >
            <div className="ae__head">
              <span className="tag">Profile photo</span>
              <button className="qs__close" onClick={onClose} aria-label="Close photo editor">×</button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              {step === 'pick' ? (
                <motion.label
                  key="pick"
                  className={`ae__drop ${over ? 'is-over' : ''}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  onDragOver={(e) => { e.preventDefault(); setOver(true) }}
                  onDragLeave={() => setOver(false)}
                  onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files[0]) }}
                  data-cursor="Pick a photo"
                >
                  <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = '' }} />
                  <motion.svg width={84} height={84} viewBox="0 0 84 84" animate={over ? { scale: 1.12, rotate: -6 } : { scale: 1, rotate: 0 }} aria-hidden>
                    <rect x={4} y={14} width={76} height={60} rx={14} fill="var(--orange)" />
                    <circle cx={30} cy={36} r={8} fill="var(--solid)" />
                    <path d="M12 66 L34 46 L48 58 L60 48 L76 64" fill="none" stroke="var(--solid)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                    <motion.g animate={{ y: [0, -5, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
                      <circle cx={68} cy={16} r={14} fill="var(--lime)" stroke="var(--solid)" strokeWidth={3} />
                      <path d="M68 9 V23 M61 16 H75" stroke="var(--solid)" strokeWidth={3} strokeLinecap="round" />
                    </motion.g>
                  </motion.svg>
                  <b className="chunk" style={{ fontSize: 24 }}>{over ? 'Drop it here' : 'Drop a photo, or click to choose'}</b>
                  <span className="small" style={{ opacity: 0.7 }}>PNG, JPEG, WebP, GIF or AVIF up to 15 MB. You will crop it next.</span>
                </motion.label>
              ) : (
                <motion.div key="edit" className="ae__edit" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                  <div
                    className="ae__frame"
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={up}
                    onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0022)))}
                    data-cursor="Drag to move"
                  >
                    {img && (
                      <img
                        src={img.src}
                        alt=""
                        draggable={false}
                        style={{ width: img.naturalWidth, height: img.naturalHeight, transform: `translate(-50%, -50%) translate(${off.x}px, ${off.y}px) rotate(${rot}deg) scale(${s})` }}
                      />
                    )}
                    <svg className="ae__mask" viewBox={`0 0 ${V} ${V}`} aria-hidden>
                      <defs>
                        <mask id="ae-hole">
                          <rect width={V} height={V} fill="#fff" />
                          <circle cx={V / 2} cy={V / 2} r={V / 2 - 6} fill="#000" />
                        </mask>
                      </defs>
                      <rect width={V} height={V} fill="rgba(23,22,27,.55)" mask="url(#ae-hole)" />
                      <motion.circle cx={V / 2} cy={V / 2} r={V / 2 - 6} fill="none" stroke="var(--lime)" strokeWidth={3} strokeDasharray="6 8" initial={{ rotate: 0 }} animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }} style={{ originX: '50%', originY: '50%' }} />
                      {[1, 2].map((i) => <line key={`v${i}`} x1={(V * i) / 3} y1={0} x2={(V * i) / 3} y2={V} stroke="rgba(255,255,255,.25)" />)}
                      {[1, 2].map((i) => <line key={`h${i}`} y1={(V * i) / 3} x1={0} y2={(V * i) / 3} x2={V} stroke="rgba(255,255,255,.25)" />)}
                    </svg>
                  </div>
                  <div className="ae__side">
                    <div className="ae__previews">
                      {[88, 48, 32].map((px, i) => (
                        <motion.span key={px} className="ae__pv" style={{ width: px, height: px, borderRadius: i === 0 ? '50%' : 10 }} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.15 + i * 0.08 }}>
                          {preview && <img src={preview} alt="" />}
                        </motion.span>
                      ))}
                    </div>
                    <span className="small" style={{ opacity: 0.65 }}>Profile, top bar and sidebar sizes</span>
                    <label className="small ae__row">
                      Zoom
                      <Slider value={Math.round(zoom * 100) / 100} min={1} max={4} step={0.01} onChange={setZoom} format={(v) => `${v.toFixed(1)}×`} label="Zoom" />
                    </label>
                    <div className="d-row">
                      <button className="d-chip" onClick={() => setRot((r) => (r + 270) % 360)} aria-label="Rotate left">⟲ Rotate</button>
                      <button className="d-chip" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate right">⟳ Rotate</button>
                      <button className="d-chip" onClick={() => { setZoom(1); setRot(0); setOff({ x: 0, y: 0 }) }}>Reset</button>
                    </div>
                    <div className="d-row" style={{ marginTop: 'auto' }}>
                      <button className="btn" onClick={save} disabled={step === 'saving'}>
                        <span>{step === 'saving' ? <TrailSpinner label="Uploading" /> : 'Save photo'}</span>
                        <span className="arrow">✓</span>
                      </button>
                      <button className="btn ghost small" onClick={() => setStep('pick')} disabled={step === 'saving'}><span>Choose another</span></button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
