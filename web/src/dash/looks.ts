import type { Glyph, ShapeKind } from '../motion/Shapes'

/* Each repository keeps one mark and pastel everywhere it appears, picked from its name so it never changes. */

export const LOOKS: { kind: ShapeKind; color: string; bg: string; glyph: Glyph }[] = [
  { kind: 'square', color: 'var(--orange)', bg: 'var(--peach)', glyph: 'folder' },
  { kind: 'circle', color: 'var(--blue)', bg: 'var(--sky)', glyph: 'branch' },
  { kind: 'tag', color: 'var(--violet)', bg: 'var(--lilac)', glyph: 'pr' },
  { kind: 'circle', color: 'var(--green)', bg: 'var(--mint)', glyph: 'pine' },
  { kind: 'square', color: 'var(--yellow)', bg: 'var(--butter)', glyph: 'file' },
]
export const lookFor = (name: string) => LOOKS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % LOOKS.length]
