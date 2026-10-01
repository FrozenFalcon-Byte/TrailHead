import { motion } from 'motion/react'

export type EvidenceItem = { ref: string; title: string; kind: string; relevance: number; kept: boolean; injection?: boolean; url?: string }

/** One passage of evidence with the stamp code gave it after Jev screened it. */
export function EvidenceCard({ e, i = 0, stamp = true }: { e: EvidenceItem; i?: number; stamp?: boolean }) {
  const verdict = e.injection ? 'INJECTION' : e.kept ? 'KEPT' : 'DROPPED'
  const tone = e.injection ? 'var(--stop)' : e.kept ? 'var(--green)' : 'var(--dim)'
  return (
    <motion.div
      initial={{ opacity: 0, x: -30, rotate: -3 }}
      whileInView={{ opacity: 1, x: 0, rotate: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'relative', borderRadius: 14, padding: '12px 14px', background: 'color-mix(in srgb, var(--fg) 8%, transparent)',
        boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--fg) 20%, transparent)', opacity: e.kept ? 1 : 0.62,
      }}
    >
      <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span className="pill">{e.kind}</span>
        <span className="mono" style={{ opacity: 0.8 }}>{e.ref}</span>
        <span style={{ marginLeft: 'auto' }}>rel {e.relevance.toFixed(2)}</span>
      </div>
      <div style={{ fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, textDecoration: e.kept ? 'none' : 'line-through' }}>
        {e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a> : e.title}
      </div>
      {stamp && (
        <motion.span
          className="display"
          initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
          whileInView={{ scale: 1, opacity: 1, rotate: -9 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.35 + i * 0.1 }}
          style={{ position: 'absolute', right: 12, bottom: -10, fontSize: 20, padding: '2px 8px', borderRadius: 6, color: tone, boxShadow: `inset 0 0 0 2.5px ${tone}`, background: 'var(--bg)' }}
        >
          {verdict}
        </motion.span>
      )}
    </motion.div>
  )
}
