import { motion } from 'motion/react'
import { Fragment, type ReactNode } from 'react'

/* Pieces shared by Ask and Find: a signpost of example questions, a journey bar that doubles as the view
   switcher, and a logbook of earlier runs. */

/** A wooden signpost; each board is an example you can take. Boards point left and right in turn. */
export function Signposts({ items, onPick, title, color = 'var(--orange)' }: { items: string[]; onPick: (q: string) => void; title: string; color?: string }) {
  return (
    <div className="sp" style={{ ['--sp' as string]: color }}>
      <div className="sp-scene" aria-hidden>
        <svg viewBox="0 0 400 60" preserveAspectRatio="none" className="sp-ground"><path d="M0 40 C 80 20, 160 50, 240 34 S 360 24, 400 36 V60 H0 Z" /></svg>
      </div>
      <span className="sp-title">{title}</span>
      <div className="sp-post">
        <span className="sp-pole" aria-hidden />
        {items.map((q, i) => (
          <motion.button
            key={q}
            type="button"
            className={`sp-board ${i % 2 ? 'is-left' : 'is-right'}`}
            onClick={() => onPick(q)}
            data-cursor="Take this trail"
            initial={{ rotate: i % 2 ? 14 : -14, y: -10 }}
            animate={{ rotate: i % 2 ? 1.5 : -1.5, y: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 9, delay: 0.1 + i * 0.08 }}
            whileHover={{ rotate: 0, x: i % 2 ? -6 : 6 }}
          >
            <span>{q}</span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

export type Station = { key: string; label: string; value: ReactNode; state: 'todo' | 'now' | 'done'; onClick?: () => void; active?: boolean }

/** Stations along a trail, joined by short connectors. A connector fills once the station before it is done;
    the open station wears the ink pill. */
export function JourneyBar({ stations, color = 'var(--blue)', id }: { stations: Station[]; color?: string; id: string }) {
  return (
    <div className="jb" style={{ ['--jb' as string]: color }} role="tablist">
      {stations.map((s, i) => (
        <Fragment key={s.key}>
          {i > 0 && (
            <span className={`jb-link ${stations[i - 1].state === 'done' ? 'is-done' : ''} ${s.state === 'now' ? 'is-next' : ''}`} aria-hidden>
              <motion.i initial={false} animate={{ scaleX: stations[i - 1].state === 'done' ? 1 : 0 }} transition={{ type: 'spring', stiffness: 160, damping: 22 }} />
            </span>
          )}
          <button type="button" role="tab" aria-selected={!!s.active} disabled={!s.onClick} className={`jb-st is-${s.state} ${s.active ? 'is-on' : ''}`} onClick={s.onClick}>
            {s.active && <motion.span layoutId={`jb-${id}`} className="jb-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="jb-dot">{s.state === 'done' ? <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></svg> : i + 1}</span>
            <span className="jb-copy">
              <b>{s.label}</b>
              <small>{s.value}</small>
            </span>
          </button>
        </Fragment>
      ))}
    </div>
  )
}

export type LogEntry = { id: string; title: string; sub: string; ok: boolean; active?: boolean; onOpen: () => void; onRemove?: () => void }

/** Earlier runs as a logbook: a dashed trail down the side with a marker per entry. */
export function Logbook({ title, entries, empty }: { title: string; entries: LogEntry[]; empty: string }) {
  return (
    <section className="lb">
      <header className="lb-head">
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden><rect x={4} y={3} width={16} height={18} rx={3} fill="var(--butter)" stroke="var(--solid)" strokeWidth={2} /><path d="M8 8h8M8 12h8M8 16h5" stroke="var(--solid)" strokeWidth={2} strokeLinecap="round" /></svg>
        <b>{title}</b>
        {entries.length > 0 && <span>{entries.length}</span>}
      </header>
      {entries.length === 0 ? (
        <p className="lb-empty">{empty}</p>
      ) : (
        <ol className="lb-list">
          {entries.map((e, i) => (
            <motion.li key={e.id} className={`lb-entry ${e.ok ? 'is-ok' : 'is-warn'} ${e.active ? 'is-on' : ''}`} initial={{ x: 12 }} animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 24, delay: Math.min(i, 8) * 0.04 }}>
              <span className="lb-mark" aria-hidden />
              <button type="button" className="lb-open" onClick={e.onOpen} data-cursor="Open">
                <b>{e.title}</b>
                <small>{e.sub}</small>
              </button>
              {e.onRemove && <button type="button" className="lb-x" onClick={e.onRemove} aria-label="Remove" data-cursor="Remove">×</button>}
            </motion.li>
          ))}
        </ol>
      )}
    </section>
  )
}
