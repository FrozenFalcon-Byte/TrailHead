import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { notify } from '../../lib/toast'
import { Shape } from '../../motion/Shapes'
import { useDash } from '../context'
import { Donut, Gauge, PALETTE } from '../viz'
import { layoutPlaces, TrailMap } from '../TrailMap'
import { Card, EASE, Gate, Loading, Note, PageHead, q, RefreshButton, useFetch } from '../ui'

type Child = { id: string; name: string; kind: string; summary: string; annotations: Record<string, string> }
type Node = { id: string; kind: string; summary: string; children: Child[] }

const fmt = (v: string) => (/^-?\d+\.\d+$/.test(v) ? Number(v).toFixed(2) : v.replace(/_/g, ' '))

export default function MapPage() {
  const { repo } = useDash()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const file = params.get('file') ?? ''
  const dir = params.get('path') ?? file.split('/').slice(0, -1).join('/')
  const { data, error, loading, reloading, reload } = useFetch<Node>(repo ? `/api/tree?path=${encodeURIComponent(dir)}&${q(repo)}` : null)
  const [filter, setFilter] = useState('')
  const [hover, setHover] = useState('')
  const crumbs = dir ? dir.split('/') : []
  useEffect(() => setFilter(''), [dir])
  useEffect(() => {
    if (!data || !file) return
    const id = setTimeout(() => document.getElementById(`m-${file}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350)
    return () => clearTimeout(id)
  }, [data, file])
  const go = (p: string) => setParams(p ? { path: p } : {})
  const kids = useMemo(() => {
    const all = data?.children ?? []
    const shown = filter ? all.filter((c) => c.name.toLowerCase().includes(filter.toLowerCase())) : all
    return [...shown].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  }, [data, filter])
  const spots = useMemo(() => new Map(layoutPlaces(data?.children ?? [], `${repo}/${dir}`).places.map((p) => [p.id, p])), [data, repo, dir])
  const picked = data?.children.find((c) => c.id === file)
  const dirs = data?.children.filter((c) => c.kind === 'dir').length ?? 0
  const comp = useMemo(() => {
    const count = (key: (c: Child) => string) => {
      const m = new Map<string, number>()
      ;(data?.children ?? []).forEach((c) => { const k = key(c); m.set(k, (m.get(k) ?? 0) + 1) })
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))
    }
    return {
      types: count((c) => (c.kind === 'dir' ? 'folders' : c.name.includes('.') ? `.${c.name.split('.').pop()}` : 'other')),
      layers: count((c) => fmt(c.annotations.layer ?? 'unlabelled')),
    }
  }, [data])
  const isProb = (v: string) => /^-?\d+\.\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 1
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => notify.ok('Path copied', text), () => undefined)

  return (
    <div className="d-body">
      <PageHead theme="lime" kicker="Map" title="The lay of the" oblique="land" note="The same tree Jev walks, with the summaries it reads at every step." actions={<RefreshButton busy={reloading} onClick={reload} />} />
      <Gate />
      {error && <Note tone="error">{error}</Note>}
      <nav className="d-crumbs mono" aria-label="Folder path">
        <button onClick={() => go('')} className={!dir ? 'is-on' : ''}>{repo || '/'}</button>
        {crumbs.map((c, i) => (
          <span key={i}>
            <i>/</i>
            <button onClick={() => go(crumbs.slice(0, i + 1).join('/'))} className={i === crumbs.length - 1 ? 'is-on' : ''} data-path={crumbs.slice(0, i + 1).join('/')}>{c}</button>
          </span>
        ))}
      </nav>
      {loading && !data && <Loading label="Unfolding the map" />}
      {data && data.children.length > 0 && (
        <TrailMap key={`${repo}/${dir}`} items={data.children} seed={`${repo}/${dir}`} label={dir || repo} picked={file} hover={hover} onHover={setHover} onOpen={go} onPick={(id) => setParams({ path: dir, file: id })} />
      )}
      {data && (
        <div className="d-explorer">
          <section className="d-explorer__list">
            <div className="d-explorer__bar">
              <input className="field d-toolbar__search" placeholder={`Search the gazetteer · ${data.children.length} places`} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter entries" />
              <span className="d-muted small">{dirs} folders · {data.children.length - dirs} files</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={dir} className="d-tree" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.3, ease: EASE }}>
                {dir && (
                  <button className="d-node is-up" onClick={() => go(crumbs.slice(0, -1).join('/'))} data-cursor="Up one folder">
                    <span className="d-node__icon">↰</span>
                    <span className="mono">..</span>
                  </button>
                )}
                {kids.map((c, i) => (
                  <motion.button
                    key={c.id}
                    id={`m-${c.id}`}
                    className={`d-node ${c.kind === 'dir' ? 'is-dir' : 'is-file'} ${c.id === file ? 'is-on' : ''} ${hover === c.id ? 'is-hover' : ''}`}
                    style={{ ['--fill' as string]: spots.get(c.id)?.fill }}
                    onPointerEnter={() => setHover(c.id)}
                    onPointerLeave={() => setHover('')}
                    onClick={() => (c.kind === 'dir' ? go(c.id) : setParams({ path: dir, file: c.id }))}
                    data-path={c.id}
                    data-cursor={c.kind === 'dir' ? `Open ${c.name}/` : `Inspect ${c.name}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 24) * 0.015 }}
                  >
                    {c.id === file && <motion.span layoutId="map-hi" className="d-node__hi" transition={{ type: 'spring', stiffness: 460, damping: 38 }} />}
                    <span className="d-node__ref" title="Grid reference on the map">{spots.get(c.id)?.ref ?? '—'}</span>
                    <span className="d-node__text">
                      <span className="mono d-node__name">{c.name}{c.kind === 'dir' ? '/' : ''}</span>
                      <span className="d-node__sum">{c.summary || 'No summary.'}</span>
                    </span>
                    {c.annotations.layer && <span className="d-tag is-soft">{fmt(c.annotations.layer)}</span>}
                  </motion.button>
                ))}
                {kids.length === 0 && <p className="d-muted" style={{ padding: 14 }}>Nothing matches “{filter}”.</p>}
              </motion.div>
            </AnimatePresence>
          </section>

          <aside className="d-explorer__detail">
            <AnimatePresence mode="wait">
              {picked ? (
                <motion.div key={picked.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE }}>
                  <Card className="d-detail">
                    <span className="d-eyebrow">file</span>
                    <h2 className="chunk d-detail__name mono" data-path={picked.id}>{picked.name}</h2>
                    <p className="mono d-muted small" style={{ margin: 0 }}>{picked.id}</p>
                    <p className="body">{picked.summary || 'No summary yet.'}</p>
                    {Object.values(picked.annotations).some(isProb) && (
                      <div className="d-gauges">
                        {Object.entries(picked.annotations).filter(([, v]) => isProb(v)).map(([k, v], i) => (
                          <Gauge key={k} p={Number(v)} size={60} thick={6} color={PALETTE[i % PALETTE.length]} label={k.replace(/_/g, ' ')} delay={i * 0.08} />
                        ))}
                      </div>
                    )}
                    {Object.values(picked.annotations).some((v) => !isProb(v)) && (
                      <dl className="d-kv">
                        {Object.entries(picked.annotations).filter(([, v]) => !isProb(v)).map(([k, v]) => (
                          <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{fmt(v)}</dd></div>
                        ))}
                      </dl>
                    )}
                    <div className="d-detail__actions">
                      <button className="btn small" onClick={() => navigate(`/app/tour?q=${encodeURIComponent(`I want to understand ${picked.id} and what it depends on.`)}`)}><span>Tour from here</span><span className="arrow">→</span></button>
                      <button className="d-chip" onClick={() => navigate(`/app/ask?q=${encodeURIComponent(`How does ${picked.id} work?`)}`)}>Ask how it works</button>
                      <button className="d-chip" onClick={() => copy(picked.id)}>Copy path</button>
                    </div>
                  </Card>
                </motion.div>
              ) : (
                <motion.div key={`dir-${dir}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3, ease: EASE }}>
                  <Card className="d-detail" theme="lime">
                    <div className="d-detail__art" aria-hidden><Shape kind="circle" color="var(--green)" glyph="pine" size={52} /></div>
                    <span className="d-eyebrow">folder</span>
                    <h2 className="chunk d-detail__name mono">{dir ? `${crumbs[crumbs.length - 1]}/` : repo}</h2>
                    <p className="body">{data.summary || 'No summary for this folder yet.'}</p>
                    {comp.types.length > 0 && (
                      <div className="d-detail__viz">
                        <span className="d-eyebrow">what is inside</span>
                        <Donut data={comp.types} size={128} thick={15} label="entries" />
                        {comp.layers.length > 1 && (
                          <>
                            <span className="d-eyebrow">layers</span>
                            <Donut data={comp.layers} size={128} thick={15} label="entries" />
                          </>
                        )}
                      </div>
                    )}
                    <p className="d-muted small">Pick a pin on the map, or a place in the gazetteer, to see what Jev knows about it.</p>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </div>
      )}
    </div>
  )
}
