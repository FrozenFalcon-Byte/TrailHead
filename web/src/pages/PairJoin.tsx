import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALPHABET, findCode, forgetLastLink, freshJoin, lastLink, validCode, type LastLink } from '../lib/pair'
import { shareOrigin } from '../lib/qr'
import { notify } from '../lib/toast'
import { PhoneGlyph } from '../motion/PairHost'
import { EASE, FLIP_OUT, LinkLine, SPRING } from './pairParts'
import './pair-phone.css'

/* The phone's side of /pair before it has a code: the same dark header the remote wears, eight keys that fill as the
   code is typed (or pasted, or read off the computer's screen by the camera), and a card to link straight back to the
   last computer. A full code links on its own: the keys wave, the beads in the header start hopping, and the page
   becomes the remote. */

const CELL_BG = ['var(--sky)', 'var(--lilac)', 'var(--mint)', 'var(--peach)', 'var(--limeade)', 'var(--butter)', 'var(--lilac)', 'var(--mint)']
const VALID = new RegExp(`[^${ALPHABET}]`, 'g')

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => Detector
  }
}
const canScan = () => typeof window !== 'undefined' && !!window.BarcodeDetector && !!navigator.mediaDevices?.getUserMedia

export function JoinView() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [bad, setBad] = useState(0)
  const [going, setGoing] = useState(false)
  const [scan, setScan] = useState(false)
  const [last, setLast] = useState<LastLink | null>(() => lastLink())
  const input = useRef<HTMLInputElement>(null)
  const full = validCode(code)

  const go = (c: string) => {
    if (!validCode(c) || going) return
    setCode(c)
    setGoing(true)
    navigator.vibrate?.(20)
    window.setTimeout(() => {
      freshJoin()
      navigate(`/pair#${c}`)
    }, 820)
  }
  const take = (raw: string) => {
    const found = findCode(raw)
    const kept = found.replace(VALID, '').slice(0, 8)
    if (kept.length < found.length) {
      setBad((b) => b + 1)
      navigator.vibrate?.([12, 40, 12])
    }
    setCode(kept)
    if (validCode(kept)) go(kept)
  }
  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!validCode(findCode(t))) return notify.warn('No code on the clipboard', 'Copy the eight letters under the QR, or the pairing link.')
      take(t)
    } catch {
      notify.warn('Could not read the clipboard', 'Long-press the boxes and paste instead.')
    }
  }

  const word = going ? 'Linking…' : full ? 'Code looks right' : code.length ? `${8 - code.length} to go` : 'Waiting for a code'
  return (
    <div className="pr t-cream pp pj">
      <motion.header className="pp-head" initial={{ y: -40, clipPath: 'inset(0 0 100% 0 round 26px)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0 round 26px)', transitionEnd: { clipPath: 'none' } }} transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
        <div className="pp-head__words">
          <small>Link this phone</small>
          <b>to your computer</b>
          <span className="pp-head__line">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={word} initial={{ y: 16, rotateX: -80 }} animate={{ y: 0, rotateX: 0 }} exit={{ y: -16, rotateX: 80, transition: FLIP_OUT }} transition={SPRING}>
                <i style={{ background: going ? 'var(--green)' : full ? 'var(--yellow)' : 'rgba(251,248,241,.3)' }} />
                {word}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
        <LinkLine status={going ? 'linked' : 'waiting'} peer="" phone bare />
      </motion.header>

      <motion.section className="pp-sec" initial={{ y: 40, clipPath: 'inset(0 0 100% 0)' }} animate={{ y: 0, clipPath: 'inset(0 0 0% 0)', transitionEnd: { clipPath: 'none' } }} transition={{ ...SPRING, delay: 0.12 }}>
        <div className="pp-sec__head">
          <h2>Type the code</h2>
          <span className="pp-sec__meta">under the QR on the computer</span>
        </div>
        <motion.label className="pj-code" animate={bad ? { x: [0, -10, 9, -6, 4, 0] } : { x: 0 }} transition={{ duration: 0.42 }} key={`shake-${bad}`}>
          <input
            ref={input}
            className="pj-code__input"
            value={code}
            onChange={(e) => take(e.target.value)}
            onPaste={(e) => {
              e.preventDefault()
              take(e.clipboardData.getData('text'))
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Pairing code, eight letters and numbers"
            disabled={going}
            autoFocus={!last}
          />
          {Array.from({ length: 8 }, (_, i) => {
            const ch = code[i]
            const here = !going && i === Math.min(code.length, 7) && !full
            return (
              <span key={i} className={`pj-cell ${ch ? 'is-on' : ''} ${i === 4 ? 'is-gap' : ''}`} style={{ '--i': i, background: ch ? CELL_BG[i] : undefined } as React.CSSProperties}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {ch && (
                    <motion.b
                      key={`${i}-${ch}`}
                      className="mono"
                      initial={{ y: 22, scale: 0.4, rotate: i % 2 ? 18 : -18 }}
                      animate={going ? { y: [0, -16, -260], scale: [1, 1.15, 0.6], rotate: [0, i % 2 ? 10 : -10, 0] } : { y: 0, scale: 1, rotate: 0 }}
                      exit={{ y: -18, scale: 0.4, transition: { duration: 0.14 } }}
                      transition={going ? { duration: 0.7, delay: i * 0.045, times: [0, 0.35, 1], ease: [0.5, 0, 0.75, 0] } : { type: 'spring', stiffness: 560, damping: 20 }}
                    >
                      {ch}
                    </motion.b>
                  )}
                </AnimatePresence>
                {here && <i className="pj-caret" />}
              </span>
            )
          })}
        </motion.label>
        <div className="pj-acts">
          <button className="pp-key pj-act" style={{ '--key': 'var(--mint)', '--i': 0 } as React.CSSProperties} onClick={paste} disabled={going}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M9 4 H15 V7 H9 Z M7 5.5 H5.5 V20 H18.5 V5.5 H17 M9 12 H15 M9 16 H13" /></svg>
            Paste
          </button>
          {canScan() && (
            <button className="pp-key pj-act" style={{ '--key': 'var(--sky)', '--i': 1 } as React.CSSProperties} onClick={() => setScan(true)} disabled={going}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15 M7 12 H17" /></svg>
              Scan the QR
            </button>
          )}
          <button className="pp-key pj-go" style={{ '--key': full ? 'var(--orange)' : 'var(--line)', '--i': 2 } as React.CSSProperties} onClick={() => go(code)} disabled={!full || going}>
            Link
            <motion.svg viewBox="0 0 24 24" aria-hidden animate={going ? { x: [0, 30], opacity: [1, 0] } : full ? { x: [0, 4, 0] } : { x: 0 }} transition={going ? { duration: 0.4 } : { duration: 0.9, repeat: full ? Infinity : 0 }}>
              <path d="M5 12 H19 M13 6 L19 12 L13 18" />
            </motion.svg>
          </button>
        </div>
        {!canScan() && <p className="pj-hint">Or point this phone’s camera app at the QR; it opens the remote by itself.</p>}
      </motion.section>

      <AnimatePresence initial={false}>
        {last && !going && (
          <motion.section key="last" className="pp-sec" initial={{ y: 30, scale: 0.9 }} animate={{ y: 0, scale: 1 }} exit={{ x: 380, rotate: 8, transition: { duration: 0.35, ease: [0.76, 0, 0.24, 1] } }} transition={{ ...SPRING, delay: 0.22 }}>
            <div className="pj-last">
              <span className="pj-last__glyph"><PhoneGlyph size={20} live /></span>
              <span className="pj-last__words">
                <small>Linked earlier</small>
                <b>{last.peer || 'Your computer'}</b>
                <span className="mono">{last.code.slice(0, 4)}·{last.code.slice(4)}</span>
              </span>
              <button className="pj-last__go" onClick={() => go(last.code)}>Link back</button>
              <button className="pj-last__x" aria-label="Forget this computer" onClick={() => { forgetLastLink(); setLast(null) }}>×</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.section className="pp-sec" initial={{ y: 40 }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.3 }}>
        <div className="pp-sec__head"><h2>How it links</h2></div>
        <ol className="pj-steps">
          {[
            { bg: 'var(--butter)', t: 'Open Pair on the computer', s: `${shareOrigin().replace(/^https?:\/\//, '')}/pair, from the top of any page` },
            { bg: 'var(--lilac)', t: 'Scan the QR or type its code', s: 'The eight letters under it, in any case' },
            { bg: 'var(--peach)', t: 'This phone becomes the remote', s: 'Steer, point, ask and pass links across' },
          ].map((st, i) => (
            <motion.li key={i} style={{ background: st.bg }} initial={{ x: -30, rotate: -3 }} animate={{ x: 0, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.38 + i * 0.08 }}>
              <b className="pj-steps__n">{i + 1}</b>
              <span><b>{st.t}</b><small>{st.s}</small></span>
            </motion.li>
          ))}
        </ol>
      </motion.section>

      <AnimatePresence>{scan && <Scanner onCode={(c) => { setScan(false); go(c) }} onClose={() => setScan(false)} />}</AnimatePresence>
    </div>
  )
}

/** The camera, reading the computer's QR; the pairing link inside it carries the code. */
function Scanner({ onCode, onClose }: { onCode: (c: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [found, setFound] = useState(false)
  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let dead = false
    const Det = window.BarcodeDetector
    if (!Det) return
    const det = new Det({ formats: ['qr_code'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (dead) return s.getTracks().forEach((t) => t.stop())
        stream = s
        const v = video.current
        if (!v) return
        v.srcObject = s
        void v.play()
        const tick = async () => {
          if (dead) return
          try {
            const hits = await det.detect(v)
            const code = hits.map((h) => findCode(h.rawValue)).find(validCode)
            if (code) {
              setFound(true)
              navigator.vibrate?.(30)
              window.setTimeout(() => onCode(code), 380)
              return
            }
          } catch {
            /* frame not ready */
          }
          timer = window.setTimeout(tick, 220)
        }
        void tick()
      })
      .catch(() => {
        notify.warn('Camera unavailable', 'Type the code instead, or allow the camera for this site.')
        onClose()
      })
    return () => {
      dead = true
      window.clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [onCode, onClose])
  return (
    <motion.div className="pj-scan" initial={{ clipPath: 'circle(0% at 50% 60%)' }} animate={{ clipPath: 'circle(150% at 50% 60%)' }} exit={{ clipPath: 'circle(0% at 50% 60%)', transition: { duration: 0.35, ease: EASE } }} transition={{ duration: 0.55, ease: EASE }}>
      <video ref={video} playsInline muted />
      <motion.div className={`pj-scan__frame ${found ? 'is-found' : ''}`} animate={found ? { scale: [1, 0.86, 1.04] } : { scale: [1, 1.03, 1] }} transition={found ? { duration: 0.35 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
        {[0, 1, 2, 3].map((k) => <i key={k} />)}
        {!found && <motion.span className="pj-scan__sweep" animate={{ top: ['8%', '92%', '8%'] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} />}
      </motion.div>
      <p>{found ? 'Got it' : 'Point at the QR on the computer'}</p>
      <button className="pj-scan__x" onClick={onClose}>Type it instead</button>
    </motion.div>
  )
}
