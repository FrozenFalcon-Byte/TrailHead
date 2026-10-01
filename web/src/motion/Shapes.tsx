import { motion } from 'motion/react'

/* Trailhead's own shape language: flat tiles (circle, square, trail-sign tag) in the vivid trail colours,
   each carrying one solid glyph from the story: the repo, a file, Jev's signal, the branching search,
   a pull request, and the summit flag. Glyphs idle with small, looping motions. */

export type ShapeKind = 'circle' | 'square' | 'tag'
export type Glyph = 'folder' | 'file' | 'signal' | 'branch' | 'pr' | 'flag' | 'grep' | 'check' | 'pine'

const INK = 'var(--solid)'
const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: 'easeInOut' as const })

const TAG = 'M16 0 H70 Q78 0 82 7 L104 44 Q108 50 104 56 L82 93 Q78 100 70 100 H16 Q0 100 0 84 V16 Q0 0 16 0 Z'

export function Shape({ kind, color, glyph, size = 120, play = true, style, className }: {
  kind: ShapeKind
  color: string
  glyph?: Glyph
  size?: number
  play?: boolean
  style?: React.CSSProperties
  className?: string
}) {
  const w = kind === 'tag' ? 110 : 100
  return (
    <svg className={className} viewBox={`0 0 ${w} 100`} width={size ? (size * w) / 100 : undefined} height={size || undefined} style={{ overflow: 'visible', ...style }} aria-hidden>
      {kind === 'circle' && <circle cx={50} cy={50} r={50} fill={color} />}
      {kind === 'square' && <rect width={100} height={100} rx={16} fill={color} />}
      {kind === 'tag' && <path d={TAG} fill={color} />}
      {glyph && (
        <g transform={kind === 'tag' ? 'translate(-4 0)' : undefined}>
          <GlyphArt glyph={glyph} bg={color} play={play} />
        </g>
      )}
    </svg>
  )
}

function GlyphArt({ glyph, bg, play }: { glyph: Glyph; bg: string; play: boolean }) {
  switch (glyph) {
    case 'folder':
      return (
        <g>
          <path d="M24 34 Q24 28 30 28 H44 L50 34 H70 Q76 34 76 40 V70 Q76 76 70 76 H30 Q24 76 24 70 Z" fill={INK} />
          <motion.rect x={32} y={44} width={36} height={6} rx={3} fill={bg} animate={play ? { scaleX: [1, 0.55, 1] } : undefined} transition={loop(2.2)} style={{ originX: '32px' }} />
          <motion.rect x={32} y={56} width={24} height={6} rx={3} fill={bg} animate={play ? { scaleX: [0.6, 1, 0.6] } : undefined} transition={loop(2.2, 0.3)} style={{ originX: '32px' }} />
        </g>
      )
    case 'file':
      return (
        <g>
          <path d="M32 22 H56 L70 36 V74 Q70 78 66 78 H32 Q28 78 28 74 V26 Q28 22 32 22 Z" fill={INK} />
          <path d="M56 22 V36 H70" fill={bg} />
          {[44, 54, 64].map((y, i) => (
            <motion.rect key={y} x={36} y={y} width={i === 2 ? 16 : 26} height={5} rx={2.5} fill={bg} animate={play ? { opacity: [0.35, 1, 0.35] } : undefined} transition={loop(1.8, i * 0.25)} />
          ))}
        </g>
      )
    case 'signal':
      return (
        <g>
          <rect x={36} y={16} width={28} height={64} rx={10} fill={INK} />
          <rect x={47} y={80} width={6} height={10} fill={INK} />
          {[28, 48, 68].map((cy, i) => (
            <motion.circle key={cy} cx={50} cy={cy} r={7.5} fill={bg} animate={play ? { opacity: [0.3, i === 0 ? 1 : 0.3, i === 1 ? 1 : 0.3, i === 2 ? 1 : 0.3, 0.3] } : undefined} transition={loop(2.4)} />
          ))}
        </g>
      )
    case 'branch':
      return (
        <g fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round">
          <motion.path d="M50 22 V44 M50 44 L30 64 M50 44 V70 M50 44 L70 64" animate={play ? { pathLength: [0.2, 1, 1, 0.2] } : undefined} transition={loop(3)} />
          <circle cx={50} cy={22} r={7} fill={INK} stroke="none" />
          <circle cx={30} cy={68} r={6} fill={INK} stroke="none" opacity={0.35} />
          <motion.rect x={43} y={66} width={14} height={14} rx={3} fill={INK} stroke="none" animate={play ? { scale: [0.6, 1.1, 1, 0.6] } : undefined} transition={loop(3)} style={{ originX: '50px', originY: '73px' }} />
          <circle cx={70} cy={68} r={6} fill={INK} stroke="none" opacity={0.35} />
        </g>
      )
    case 'pr':
      return (
        <g fill="none" stroke={INK} strokeWidth={7} strokeLinecap="round">
          <path d="M34 30 V70" />
          <motion.path d="M66 70 V48 Q66 34 52 34 H44" animate={play ? { pathLength: [0, 1, 1] } : undefined} transition={loop(2.4)} />
          <path d="M48 26 L40 34 L48 42" strokeLinejoin="round" />
          <circle cx={34} cy={26} r={7} fill={INK} stroke="none" />
          <circle cx={34} cy={74} r={7} fill={INK} stroke="none" />
          <circle cx={66} cy={74} r={7} fill={INK} stroke="none" />
        </g>
      )
    case 'flag':
      return (
        <g>
          <rect x={33} y={20} width={6} height={62} rx={3} fill={INK} />
          <motion.path fill={INK} animate={play ? { d: ['M39 22 L72 32 L39 44 Z', 'M39 22 L68 36 L39 44 Z', 'M39 22 L72 32 L39 44 Z'] } : undefined} transition={loop(1.6)} d="M39 22 L72 32 L39 44 Z" />
          <path d="M22 82 L44 58 L54 68 L62 60 L80 82 Z" fill={INK} />
        </g>
      )
    case 'grep':
      return (
        <g>
          <circle cx={45} cy={44} r={18} fill="none" stroke={INK} strokeWidth={8} />
          <rect x={58} y={58} width={10} height={24} rx={5} fill={INK} transform="rotate(-45 63 70)" />
          <motion.circle cx={45} cy={44} r={5} fill={INK} animate={play ? { cx: [38, 52, 38] } : undefined} transition={loop(1.6)} />
        </g>
      )
    case 'check':
      return (
        <motion.path d="M28 52 L44 68 L74 34" fill="none" stroke={INK} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" animate={play ? { pathLength: [0, 1, 1, 0] } : undefined} transition={loop(2.4)} />
      )
    case 'pine':
      return (
        <motion.g animate={play ? { rotate: [-3, 3, -3] } : undefined} transition={loop(2.8)} style={{ originX: '50px', originY: '82px' }}>
          <rect x={46} y={66} width={8} height={16} fill={INK} />
          <path d="M50 16 L70 44 L60 44 L74 66 L26 66 L40 44 L30 44 Z" fill={INK} />
        </motion.g>
      )
  }
}

/** The story's five beats, in order. Reused by the loader, the hero conveyor and section headings. */
export const STORY: { kind: ShapeKind; color: string; glyph: Glyph; label: string }[] = [
  { kind: 'circle', color: 'var(--violet)', glyph: 'folder', label: 'the repo' },
  { kind: 'square', color: 'var(--green)', glyph: 'branch', label: 'the search' },
  { kind: 'tag', color: 'var(--orange)', glyph: 'signal', label: 'Jev decides' },
  { kind: 'square', color: 'var(--yellow)', glyph: 'pr', label: 'the history' },
  { kind: 'circle', color: 'var(--blue)', glyph: 'flag', label: 'the answer' },
]

/** A small shape sitting inline in a line of type, like an icon dropped into a sentence. */
export function InlineShape({ kind, color, glyph, delay = 0 }: { kind: ShapeKind; color: string; glyph: Glyph; delay?: number }) {
  return (
    <motion.span
      style={{ display: 'inline-block', verticalAlign: '-0.12em', margin: '0 0.12em', lineHeight: 0 }}
      initial={{ scale: 0, rotate: -20 }}
      whileInView={{ scale: 1, rotate: 0 }}
      viewport={{ once: true, amount: 0.8 }}
      transition={{ type: 'spring', stiffness: 260, damping: 15, delay }}
    >
      <Shape kind={kind} color={color} glyph={glyph} size={0} style={{ width: 'auto', height: '0.86em' }} />
    </motion.span>
  )
}
