import { AnimatePresence, motion } from 'motion/react'

export type BeamOption = { name: string; p: number; kind?: string }
export type BeamStep = { node: string; options: BeamOption[]; none?: number; depth?: number }

type Props = { steps: BeamStep[]; kept?: Set<string>; visible?: number; compact?: boolean; delay?: number }

const label = (node: string) => (node === '' || node === '/' ? '/' : node.split('/').filter(Boolean).pop() + (node.endsWith('.py') ? '' : '/'))

/** Beam search as it happens: one column per node Jev was asked about, options ranked by probability, the kept branch lit. */
export function BeamColumns({ steps, kept, visible = steps.length, compact = false, delay = 0 }: Props) {
  const shown = steps.slice(0, visible)
  return (
    <div style={{ display: 'flex', gap: compact ? 10 : 16, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'thin' }}>
      <AnimatePresence initial={true}>
        {shown.map((step, i) => (
          <motion.div
            key={`${step.node}-${i}`}
            initial={{ opacity: 0, y: 26, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 0.7, delay: delay + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            style={{
              minWidth: compact ? 0 : 210, flex: compact ? '1 1 0' : '0 0 auto', borderRadius: 16, padding: compact ? 12 : 16,
              background: 'color-mix(in srgb, var(--fg) 8%, transparent)', boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 22%, transparent)',
            }}
          >
            <div className="small" style={{ opacity: 0.7, marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span className="mono">{label(step.node)}</span>
              {step.none !== undefined && <span>none {step.none.toFixed(2)}</span>}
            </div>
            {step.options.slice(0, compact ? 4 : 5).map((o, j) => {
              const lit = kept ? kept.has(o.name) : j === 0 && o.p >= 0.3
              return (
                <div key={o.name} style={{ marginBottom: 7, opacity: lit ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: lit ? 780 : 560, fontSize: compact ? 13 : 14 }}>
                    <span className="mono" style={{ textDecoration: !lit && o.p < 0.05 ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: compact ? 'calc(100% - 38px)' : 150 }}>{o.name}</span>
                    <span>{o.p.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'color-mix(in srgb, var(--fg) 14%, transparent)', overflow: 'hidden', marginTop: 3 }}>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: Math.max(o.p, 0.015) }}
                      transition={{ duration: 0.9, delay: delay + i * 0.12 + 0.25 + j * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      style={{ height: '100%', originX: 0, background: lit ? 'var(--blaze)' : 'var(--fg)' }}
                    />
                  </div>
                </div>
              )
            })}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
