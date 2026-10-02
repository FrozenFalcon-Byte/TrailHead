import type { Glyph, ShapeKind } from '../motion/Shapes'
import type { MarkerId } from './logic'

/* Climbers are trail markers, not people: one flat shape per player in the trail colours, each with a glyph. */

export const MARKERS: Record<MarkerId, { kind: ShapeKind; color: string; bg: string; glyph: Glyph; label: string }> = {
  orange: { kind: 'tag', color: 'var(--orange)', bg: 'var(--peach)', glyph: 'flag', label: 'Flag' },
  blue: { kind: 'circle', color: 'var(--blue)', bg: 'var(--sky)', glyph: 'branch', label: 'Fork' },
  green: { kind: 'square', color: 'var(--green)', bg: 'var(--mint)', glyph: 'pine', label: 'Pine' },
  violet: { kind: 'circle', color: 'var(--violet)', bg: 'var(--lilac)', glyph: 'signal', label: 'Signal' },
  yellow: { kind: 'square', color: 'var(--yellow)', bg: 'var(--butter)', glyph: 'file', label: 'Page' },
  lime: { kind: 'tag', color: 'var(--lime)', bg: 'var(--limeade)', glyph: 'check', label: 'Tick' },
}
