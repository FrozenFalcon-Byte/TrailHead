import { AnimatePresence, motion } from 'motion/react'
import { forwardRef, useEffect, useState } from 'react'
import { usePref } from '../lib/prefs'

/* A text box whose placeholder types out example questions one after another. Tab fills in the one on show, or,
   once you have started typing, the first example that begins with what you typed. */

function useTyped(list: readonly string[], idle: boolean) {
  const motionPref = usePref('motion')
  const typing = usePref('typedHints')
  const [i, setI] = useState(0)
  const [n, setN] = useState(0)
  const [phase, setPhase] = useState<'type' | 'hold' | 'erase'>('type')
  const still = motionPref === 'off' || !typing
  const full = list[i % list.length] ?? ''
  useEffect(() => {
    if (!idle || still || !full) return
    const t = window.setTimeout(
      () => {
        if (phase === 'type') n < full.length ? setN(n + 1) : setPhase('hold')
        else if (phase === 'hold') setPhase('erase')
        else if (n > 0) setN(Math.max(0, n - 3))
        else {
          setI((x) => x + 1)
          setPhase('type')
        }
      },
      phase === 'type' ? 38 + Math.random() * 40 : phase === 'hold' ? 1900 : 16,
    )
    return () => window.clearTimeout(t)
  }, [idle, still, full, n, phase])
  return { shown: still ? full : full.slice(0, n), full }
}

type Props = {
  value: string
  onValue: (v: string) => void
  suggestions: readonly string[]
  multiline?: boolean
} & Omit<React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>

export const TypedField = forwardRef<HTMLInputElement & HTMLTextAreaElement, Props>(function TypedField({ value, onValue, suggestions, multiline, className, rows, ...rest }, ref) {
  const [focused, setFocused] = useState(false)
  const [font, setFont] = useState<React.CSSProperties>({})
  const { shown, full } = useTyped(suggestions, value === '')
  const match = value === '' ? full : suggestions.find((s) => s.toLowerCase().startsWith(value.toLowerCase()) && s.length > value.length)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && match) {
      e.preventDefault()
      onValue(match)
    }
  }
  const common = {
    ...rest,
    ref,
    className: `field ${className ?? ''}`,
    value,
    placeholder: shown + (value === '' && shown.length < full.length ? '▏' : ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onValue(e.target.value),
    onKeyDown,
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      // The grey completion sits exactly over the text, so it borrows the box's own type and padding.
      const cs = getComputedStyle(e.currentTarget)
      setFont({ padding: cs.padding, fontSize: cs.fontSize, fontWeight: cs.fontWeight as React.CSSProperties['fontWeight'], fontFamily: cs.fontFamily, letterSpacing: cs.letterSpacing })
      setFocused(true)
    },
    onBlur: () => setFocused(false),
  }
  return (
    <span className={`typed ${multiline ? 'is-multi' : ''}`}>
      {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
      {/* What you have typed so far, then the rest of the example in grey: Tab takes it. */}
      {value !== '' && match && focused && !multiline && (
        <span className="typed__ghost" style={font} aria-hidden>
          <span style={{ visibility: 'hidden' }}>{value}</span>
          {match.slice(value.length)}
        </span>
      )}
      <AnimatePresence>
        {focused && match && (
          <motion.kbd className="typed__tab" initial={{ opacity: 0, scale: 0.7, x: 6 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ type: 'spring', stiffness: 500, damping: 26 }}>
            Tab
          </motion.kbd>
        )}
      </AnimatePresence>
    </span>
  )
})
