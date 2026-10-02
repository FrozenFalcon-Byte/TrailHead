import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Shape } from '../motion/Shapes'
import { EASE, Prob, Prose } from './ui'

/* An answer as a field note: a stub on the left carries the verdict, the prose sits on paper beside it, and the
   claims Jev checked hang below as waypoints, each with its support and directness dials. The sources used are
   chips at the foot. Ask and the tour's explanation both use it. */

type Ev = { ref: string; kind: string; title: string; url: string; label: string; kept?: boolean }
type Claim = { id: string; text: string; evidence: string[]; p_support: number; directness: number; status: string; badge: string; reason: string }
export type AnswerLike = { status: string; text: string; confidence: number | null; abstain_reason: string; render: string; claims: Claim[]; evidence: Ev[] }

const RENDER: Record<string, string> = {
  llm: 'Written by the LLM from verified claims, then checked',
  claims: 'The verified claims themselves; no prose model involved',
}
const BADGE: Record<string, string> = { high: 'var(--green)', medium: 'var(--blue)', low: 'var(--orange)' }

export function AnswerSheet({ answer, title, kicker }: { answer: AnswerLike; title?: ReactNode; kicker?: string }) {
  const ok = answer.status === 'answered'
  const cited = new Set(answer.claims?.flatMap((c) => c.evidence) ?? [])
  const sources = (answer.evidence ?? []).filter((e) => e.label && cited.has(e.label))
  return (
    <motion.article className={`as ${ok ? 'is-ok' : 'is-unsure'}`} initial={{ y: 14 }} animate={{ y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
      <div className="as-top">
        <div className="as-stub">
          <motion.span initial={{ scale: 0, rotate: -120 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}>
            <Shape kind={ok ? 'circle' : 'tag'} color={ok ? 'var(--green)' : 'var(--orange)'} glyph={ok ? 'check' : 'signal'} size={40} />
          </motion.span>
          <b>{ok ? 'Answered' : 'Not sure'}</b>
        </div>
        <div className="as-head">
          {kicker && <span className="as-kicker">{kicker}</span>}
          {title && <span className="as-title">{title}</span>}
          {!ok && answer.abstain_reason && <span className="as-why">Held back because {answer.abstain_reason}.</span>}
        </div>
        {answer.confidence != null && (
          <div className="as-conf">
            <Prob p={answer.confidence} size={52} color={ok ? 'var(--green)' : 'var(--orange)'} />
            <span>confidence</span>
          </div>
        )}
      </div>

      <div className="as-body">
        <Prose text={answer.text} evidence={answer.evidence} />
      </div>

      {answer.claims?.length > 0 && (
        <div className="as-claims">
          <span className="as-label">What Jev checked</span>
          <ol>
            {answer.claims.map((c, i) => (
              <motion.li key={c.id} className={`as-claim is-${c.status}`} style={{ ['--badge' as string]: c.status === 'dropped' ? 'var(--dim)' : BADGE[c.badge] ?? 'var(--orange)' }} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.06, ease: EASE }}>
                <span className="as-claim__pin">{c.status === 'dropped' ? '×' : i + 1}</span>
                <span className="as-claim__text">
                  <span>{c.text}</span>
                  <small>{c.status === 'dropped' ? 'dropped' : `${c.badge} support`} · cites {c.evidence.join(', ') || 'nothing'}{c.reason ? ` · ${c.reason}` : ''}</small>
                </span>
                <span className="as-claim__dials">
                  <span><Prob p={c.p_support} size={30} color="var(--badge)" /><i>support</i></span>
                  <span><Prob p={c.directness} size={30} color="var(--blue)" /><i>direct</i></span>
                </span>
              </motion.li>
            ))}
          </ol>
        </div>
      )}

      <div className="as-foot">
        {sources.length > 0 && (
          <span className="as-sources">
            {sources.slice(0, 8).map((e) => (
              <a key={e.label} href={e.url || undefined} target="_blank" rel="noreferrer noopener" className="as-src" title={e.ref}>
                <b>{e.label}</b>{e.title || e.ref}
              </a>
            ))}
          </span>
        )}
        <span className="as-render">{RENDER[answer.render] ?? (answer.render ? `Prose: ${answer.render}` : 'From navigation')}</span>
      </div>
    </motion.article>
  )
}
