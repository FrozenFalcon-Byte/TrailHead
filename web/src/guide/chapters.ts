import type { Glyph, ShapeKind } from '../motion/Shapes'

/* The guide's chapters, in reading order. Each one is a stop on the journey strip: `place` is the landmark drawn
   for it, so reading the guide walks the trail from the trailhead, over the river and through the forest, up to
   the summit. Ids match the <section> ids in markup.ts. */

export type Place = 'trailhead' | 'fork' | 'signal' | 'gate' | 'signposts' | 'river' | 'forest' | 'switchback' | 'tower' | 'cache' | 'camp' | 'lake' | 'ridge' | 'hut' | 'summit'

export type Chapter = { id: string; label: string; group: string; kind: ShapeKind; color: string; glyph: Glyph; place: Place; where: string }

export const CHAPTERS: Chapter[] = [
  { id: 'start', label: 'The trailhead', group: 'Basics', kind: 'tag', color: 'var(--orange)', glyph: 'flag', place: 'trailhead', where: 'Trailhead' },
  { id: 'split', label: 'Who does what', group: 'Basics', kind: 'circle', color: 'var(--violet)', glyph: 'branch', place: 'fork', where: 'The fork' },
  { id: 'jev', label: 'Jev', group: 'Basics', kind: 'tag', color: 'var(--violet)', glyph: 'signal', place: 'signal', where: 'Jev’s signal' },
  { id: 'beatapi', label: 'BeatAPI pacing', group: 'Basics', kind: 'square', color: 'var(--yellow)', glyph: 'check', place: 'gate', where: 'The toll gate' },
  { id: 'vectorless', label: 'Vectorless RAG', group: 'Finding', kind: 'square', color: 'var(--green)', glyph: 'branch', place: 'signposts', where: 'Signpost meadow' },
  { id: 'ingest', label: 'Reading a repo', group: 'Finding', kind: 'circle', color: 'var(--blue)', glyph: 'folder', place: 'river', where: 'History river' },
  { id: 'screening', label: 'Screening', group: 'Finding', kind: 'tag', color: 'var(--orange)', glyph: 'grep', place: 'forest', where: 'The forest' },
  { id: 'answers', label: 'Cited answers', group: 'Answering', kind: 'square', color: 'var(--violet)', glyph: 'pr', place: 'switchback', where: 'Switchbacks' },
  { id: 'guard', label: 'Guardrails', group: 'Answering', kind: 'circle', color: 'var(--green)', glyph: 'check', place: 'tower', where: 'Lookout tower' },
  { id: 'cache', label: 'The cache', group: 'Answering', kind: 'square', color: 'var(--yellow)', glyph: 'file', place: 'cache', where: 'Supply cache' },
  { id: 'tours', label: 'Guided tours', group: 'Doing', kind: 'circle', color: 'var(--blue)', glyph: 'flag', place: 'camp', where: 'Base camp' },
  { id: 'issues', label: 'First issues', group: 'Doing', kind: 'square', color: 'var(--yellow)', glyph: 'pr', place: 'lake', where: 'The lake' },
  { id: 'llm', label: 'The LLM', group: 'Doing', kind: 'tag', color: 'var(--orange)', glyph: 'signal', place: 'ridge', where: 'The ridge' },
  { id: 'web', label: 'The website', group: 'Doing', kind: 'circle', color: 'var(--green)', glyph: 'pine', place: 'hut', where: 'Mountain hut' },
  { id: 'qr', label: 'QR workshop', group: 'Doing', kind: 'square', color: 'var(--blue)', glyph: 'grep', place: 'summit', where: 'The summit' },
]
