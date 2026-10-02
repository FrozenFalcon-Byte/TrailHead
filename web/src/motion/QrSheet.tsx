import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { closeQr, isLocalOrigin, makeQr, useQrRequest, type QrMatrix } from '../lib/qr'
import { notify } from '../lib/toast'

/* A QR in the house style: rounded modules, the three finder eyes drawn as trail-sign tiles in the accent
   colours, and the Trailhead mark in the middle (the code carries enough redundancy for the gap). It draws
   itself in with a diagonal sweep. */

const EASE = [0.22, 1, 0.36, 1] as const
const isFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)

function modulesPath(m: QrMatrix, hole: number) {
  const n = m.size
  const lo = Math.floor((n - hole) / 2)
  const hi = lo + hole
  let d = ''
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!m.dark(r, c) || isFinder(r, c, n)) continue
      if (hole && r >= lo && r < hi && c >= lo && c < hi) continue
      d += `M${c + 0.12} ${r + 0.5}a0.38 0.38 0 0 1 0.38 -0.38h0a0.38 0.38 0 0 1 0.38 0.38v0a0.38 0.38 0 0 1 -0.38 0.38h0a0.38 0.38 0 0 1 -0.38 -0.38z`
    }
  return d
}

export function QrCode({ text, size = 260, animate = true }: { text: string; size?: number; animate?: boolean }) {
  const m = useMemo(() => makeQr(text, text.length > 900 ? 'L' : 'Q'), [text])
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const n = m.size
  // A centre logo only when error correction can spare it.
  const hole = text.length > 900 ? 0 : Math.max(5, Math.round(n * 0.2)) | 1
  const d = useMemo(() => modulesPath(m, hole), [m, hole])
  const q = 3
  const eyes = [
    [0, 0, 'var(--orange)'],
    [0, n - 7, 'var(--violet)'],
    [n - 7, 0, 'var(--green)'],
  ] as const
  return (
    <svg viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} width={size} height={size} className="qr" role="img" aria-label="QR code">
      <rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} rx={3} fill="#fff" />
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
          <motion.stop offset={0} stopColor="#fff" />
          <motion.stop initial={{ offset: animate ? 0 : 1 }} animate={{ offset: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.15 }} stopColor="#fff" />
          <motion.stop initial={{ offset: animate ? 0.001 : 1 }} animate={{ offset: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.15 }} stopColor="#000" />
        </linearGradient>
        <mask id={`${uid}-m`}>
          <rect x={0} y={0} width={n} height={n} fill={`url(#${uid}-g)`} />
        </mask>
      </defs>
      <path d={d} fill="#17161b" mask={`url(#${uid}-m)`} />
      {eyes.map(([r, c, color], i) => (
        <motion.g key={i} initial={animate ? { scale: 0, rotate: -45 } : false} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 + i * 0.12 }} style={{ originX: `${c + 3.5}px`, originY: `${r + 3.5}px` }}>
          <rect x={c + 0.5} y={r + 0.5} width={6} height={6} rx={1.8} fill="none" stroke="#17161b" strokeWidth={1} />
          <rect x={c + 2} y={r + 2} width={3} height={3} rx={0.9} fill={color} />
        </motion.g>
      ))}
      {hole > 0 && (
        <motion.g initial={animate ? { scale: 0 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.9 }} style={{ originX: `${n / 2}px`, originY: `${n / 2}px` }}>
          <rect x={(n - hole) / 2 + 0.6} y={(n - hole) / 2 + 0.6} width={hole - 1.2} height={hole - 1.2} rx={1.4} fill="#ff5b2e" />
          <path
            transform={`translate(${(n - hole) / 2 + 0.6} ${(n - hole) / 2 + 0.6}) scale(${(hole - 1.2) / 32})`}
            d="M8 25 L19 19 L11 13 L22 8 M17.5 6.2 L23.6 7.4 L21.4 13.2"
            fill="none"
            stroke="#17161b"
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </motion.g>
      )}
    </svg>
  )
}

/** PNG of the code with a caption, for saving or printing. Drawn on a canvas from the same matrix. */
async function toPng(text: string, title: string): Promise<Blob> {
  const m = makeQr(text, text.length > 900 ? 'L' : 'Q')
  const cell = 12
  const pad = 4 * cell
  const w = m.size * cell + pad * 2
  const h = w + 70
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#17161b'
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (m.dark(r, c)) g.fillRect(pad + c * cell, pad + r * cell, cell, cell)
  g.font = '800 22px "Archivo Variable", system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText(title.slice(0, 48), w / 2, w + 30)
  g.font = '600 14px system-ui, sans-serif'
  g.fillStyle = '#5f5c66'
  g.fillText('Trailhead · scan to open', w / 2, w + 54)
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the image'))), 'image/png'))
}

export function QrSheet() {
  const req = useQrRequest()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!req) return
    setCopied(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeQr()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req])

  const copy = async () => {
    if (!req) return
    try {
      await navigator.clipboard.writeText(req.url)
      setCopied(true)
      notify.ok('Link copied', req.title)
    } catch {
      notify.error('Could not copy', 'The browser blocked clipboard access.')
    }
  }
  const save = async () => {
    if (!req) return
    const blob = await toPng(req.url, req.title)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${req.filename ?? 'trailhead-qr'}.png`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    notify.ok('QR image saved', a.download)
  }
  const share = async () => {
    if (!req) return
    try {
      await navigator.share({ title: req.title, url: req.url })
    } catch {
      /* closed the share sheet */
    }
  }
  const local = req ? isLocalOrigin(req.url) : false

  return (
    <AnimatePresence>
      {req && (
        <motion.div className="qs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { delay: 0.15 } }} onClick={closeQr}>
          <motion.div
            className="qs__card"
            role="dialog"
            aria-modal
            aria-label={req.title}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 80, scale: 0.9, rotate: -4, opacity: 0 }}
            animate={{ y: 0, scale: 1, rotate: 0, opacity: 1 }}
            exit={{ y: 60, scale: 0.92, rotate: 3, opacity: 0, transition: { duration: 0.25, ease: [0.76, 0, 0.24, 1] } }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <button className="qs__close" onClick={closeQr} aria-label="Close QR code">×</button>
            <span className="tag">Scan to open</span>
            <h3 className="chunk qs__title">{req.title}</h3>
            <div className="qs__code">
              <QrCode key={req.url} text={req.url} size={250} />
            </div>
            {req.note && <p className="small qs__note">{req.note}</p>}
            {local && (
              <p className="small qs__warn">
                This link points at <b>localhost</b>, which only this computer can open. Set an address your phone can reach in{' '}
                <Link to="/app/settings#sharing" onClick={closeQr}>Settings → Sharing</Link>.
              </p>
            )}
            <div className="qs__url mono" title={req.url}>{req.url.length > 72 ? `${req.url.slice(0, 64)}…` : req.url}</div>
            <div className="qs__actions">
              <button className="btn small" onClick={copy}><span>{copied ? 'Copied ✓' : 'Copy link'}</span></button>
              <button className="btn small ghost" onClick={save}><span>Save PNG</span></button>
              {'share' in navigator && <button className="btn small ghost" onClick={share}><span>Share…</span></button>}
              <a className="btn small ghost" href={req.url} target="_blank" rel="noreferrer noopener"><span>Open ↗</span></a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
