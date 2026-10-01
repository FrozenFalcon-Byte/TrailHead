import { AnimatePresence, motion } from 'motion/react'
import { useTheme } from '../lib/theme'

/** Bottom-right switch between the light (default) and dark themes. The knob slides across and swaps its glyph. */
export function ThemeSwitch() {
  const [theme, set] = useTheme()
  const dark = theme === 'dark'
  return (
    <button className="theme-switch" onClick={() => set(dark ? 'light' : 'dark')} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} data-cursor={dark ? 'Light' : 'Dark'}>
      <motion.span layout className="theme-switch__knob" style={{ order: dark ? 2 : 0, background: dark ? 'var(--violet)' : 'var(--yellow)' }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.svg key={theme} width={18} height={18} viewBox="0 0 24 24" initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} exit={{ rotate: 90, scale: 0 }} transition={{ duration: 0.25 }}>
            {dark ? (
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
            ) : (
              <g fill="currentColor">
                <circle cx={12} cy={12} r={5} />
                {Array.from({ length: 8 }, (_, i) => (
                  <rect key={i} x={11} y={1} width={2} height={4} rx={1} transform={`rotate(${i * 45} 12 12)`} />
                ))}
              </g>
            )}
          </motion.svg>
        </AnimatePresence>
      </motion.span>
      <motion.span layout className="theme-switch__label">{dark ? 'Dark' : 'Light'}</motion.span>
    </button>
  )
}
