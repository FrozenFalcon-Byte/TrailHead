import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useDash } from '../context'
import { Card, EASE, Gate, Loading, Note, PageHead, q, useFetch } from '../ui'

type Child = { id: string; name: string; kind: string; summary: string; annotations: Record<string, string> }
type Node = { id: string; kind: string; summary: string; children: Child[] }

export default function MapPage() {
  const { repo } = useDash()
  const [params, setParams] = useSearchParams()
  const file = params.get('file') ?? ''
  const dir = params.get('path') ?? file.split('/').slice(0, -1).join('/')
  const { data, error, loading } = useFetch<Node>(repo ? `/api/tree?path=${encodeURIComponent(dir)}&${q(repo)}` : null)
  const crumbs = dir ? dir.split('/') : []
  useEffect(() => {
    if (!data || !file) return
    const id = setTimeout(() => document.getElementById(`m-${file}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 450)
    return () => clearTimeout(id)
  }, [data, file])
  const fmt = (v: string) => (/^-?\d+\.\d+$/.test(v) ? Number(v).toFixed(2) : v.replace(/_/g, ' '))
  const go = (p: string) => setParams(p ? { path: p } : {})

  return (
    <>
      <PageHead theme="lime" kicker="Map" title="The lay of the" oblique="land" note="the same tree Jev walks, with the summaries it reads at every step" />
      <div className="d-body">
        <Gate />
        {error && <Note tone="error">{error}</Note>}
        <div className="d-row mono" style={{ fontWeight: 700 }}>
          <button className="d-chip" onClick={() => go('')}>{repo || '/'}</button>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>/ <button className="d-chip" onClick={() => go(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>
          ))}
        </div>
        {data?.summary && <Card theme="sky"><p className="body" style={{ margin: 0 }}>{data.summary}</p></Card>}
        {loading && !data && <Loading label="Unfolding the map" />}
        <AnimatePresence mode="wait">
          {data && (
            <motion.div key={dir} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35, ease: EASE }} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {data.children.map((c, i) => {
                const selected = c.id === file
                return (
                  <motion.button key={c.id} id={`m-${c.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.025 }} whileHover={{ y: -3 }} onClick={() => (c.kind === 'dir' ? go(c.id) : setParams({ path: dir, file: c.id }))} className="d-card" style={{ textAlign: 'left', cursor: 'pointer', border: 0, display: 'grid', gap: 6, alignContent: 'start', boxShadow: selected ? 'inset 0 0 0 3px var(--orange)' : undefined, background: c.kind === 'dir' ? 'var(--chip)' : '#fff' }}>
                    <span className="mono" style={{ fontWeight: 800 }}>{c.kind === 'dir' ? '▸ ' : ''}{c.name}{c.kind === 'dir' ? '/' : ''}</span>
                    <span className="small" style={{ opacity: 0.72, display: '-webkit-box', WebkitLineClamp: selected ? 12 : 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.summary || 'No summary.'}</span>
                    {Object.keys(c.annotations).length > 0 && (
                      <span className="d-row" style={{ gap: 5 }}>
                        {Object.entries(c.annotations).slice(0, 4).map(([k, v]) => <span key={k} className="pill" style={{ ['--fg' as string]: 'var(--blue)' }}>{k.replace(/_/g, ' ')}: {fmt(v)}</span>)}
                      </span>
                    )}
                    {selected && c.kind === 'file' && <Link to="/app/tour" className="small" onClick={(e) => e.stopPropagation()}>Plan a tour that starts here →</Link>}
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
