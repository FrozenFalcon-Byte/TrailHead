import type { Glyph, ShapeKind } from '../motion/Shapes'

/* Every dashboard page, with the shape that stands for it. The sidebar, the page masthead and the page switch all
   read from here, so a page keeps one identity everywhere it shows up. */

export type NavItem = { to: string; label: string; end?: boolean; kind: ShapeKind; color: string; glyph: Glyph; bg: string; key: string; group: 'Explore' | 'Inspect' | 'You' }

export const NAV: NavItem[] = [
  { to: '/app', label: 'Overview', end: true, kind: 'circle', color: 'var(--violet)', glyph: 'folder', bg: 'var(--lilac)', key: 'o', group: 'Explore' },
  { to: '/app/ask', label: 'Ask', kind: 'tag', color: 'var(--orange)', glyph: 'signal', bg: 'var(--peach)', key: 'a', group: 'Explore' },
  { to: '/app/tour', label: 'Tour', kind: 'circle', color: 'var(--blue)', glyph: 'flag', bg: 'var(--sky)', key: 't', group: 'Explore' },
  { to: '/app/find', label: 'Find', kind: 'square', color: 'var(--green)', glyph: 'branch', bg: 'var(--mint)', key: 'f', group: 'Explore' },
  { to: '/app/issues', label: 'First issues', kind: 'square', color: 'var(--yellow)', glyph: 'pr', bg: 'var(--butter)', key: 'i', group: 'Explore' },
  { to: '/app/map', label: 'Map', kind: 'circle', color: 'var(--green)', glyph: 'pine', bg: 'var(--limeade)', key: 'm', group: 'Explore' },
  { to: '/app/decisions', label: 'Decisions', kind: 'tag', color: 'var(--violet)', glyph: 'check', bg: 'var(--lilac)', key: 'd', group: 'Inspect' },
  { to: '/app/evals', label: 'Evals', kind: 'square', color: 'var(--blue)', glyph: 'grep', bg: 'var(--sky)', key: 'e', group: 'Inspect' },
  { to: '/app/repos', label: 'Repositories', kind: 'circle', color: 'var(--orange)', glyph: 'file', bg: 'var(--peach)', key: 'r', group: 'Inspect' },
]
export const PROFILE: NavItem = { to: '/app/profile', label: 'Profile', kind: 'circle', color: 'var(--yellow)', glyph: 'flag', bg: 'var(--butter)', key: 'p', group: 'You' }
export const SETTINGS: NavItem = { to: '/app/settings', label: 'Settings', kind: 'square', color: 'var(--lime)', glyph: 'branch', bg: 'var(--limeade)', key: 's', group: 'You' }
export const HELP: NavItem = { to: '/app/help', label: 'Help', kind: 'tag', color: 'var(--blue)', glyph: 'flag', bg: 'var(--sky)', key: 'h', group: 'You' }
export const ALL = [...NAV, PROFILE, SETTINGS, HELP]

export const itemFor = (path: string) => ALL.find((n) => (n.end ? path === n.to : path.startsWith(n.to))) ?? NAV[0]
export const indexFor = (path: string) => ALL.indexOf(itemFor(path))
