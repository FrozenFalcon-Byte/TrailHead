import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useCtx } from '../../lib/ctx'
import { errorText, notify, toast } from '../../lib/toast'
import { Select } from '../../motion/Select'
import { TrailSpinner } from '../../motion/TrailSpinner'
import { GH_TOKEN_KEY } from '../../pages/AuthCallback'
import { LOOKS, lookFor } from '../looks'
import { useDash, type RepoInfo } from '../context'
import { Donut, PALETTE, Treemap } from '../viz'
import { Card, EASE, Empty, Note, PageHead, RefreshButton, Split } from '../ui'
import { Shape } from '../../motion/Shapes'
import { TypedField } from '../../motion/TypedField'

type GhRepo = { full_name: string; description: string | null; stargazers_count: number; language: string | null; private: boolean; html_url: string; pushed_at: string }
const REPO_EXAMPLES = ['scrapy/scrapy', 'pallets/flask', 'psf/requests', 'encode/httpx', 'tiangolo/fastapi', 'django/django']
const NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

const n = (v?: number) => (v ?? 0).toLocaleString()

/** One onboarded repository as a ticket: its mark on the stub, what was read in a sentence, and what to do with it. */
function RepoTicket({ r, active, onPick, i }: { r: RepoInfo; active: boolean; onPick: () => void; i: number }) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const running = r.status === 'running'
  const failed = r.status === 'failed'
  const ready = r.status === 'ready'
  const look = lookFor(r.repo)
  const [owner, name] = r.repo.split('/')
  useCtx(ref, () => ({
    title: r.repo,
    items: [
      { label: active ? 'Current repository' : 'Use this repository', icon: '✓', disabled: active || !ready, run: onPick },
      { label: 'Ask about it', icon: '?', disabled: !ready, run: () => { onPick(); navigate('/app/ask') } },
      { label: 'Open its map', icon: '▸', disabled: !ready, run: () => { onPick(); navigate('/app/map') } },
      { label: 'Open on GitHub', icon: '↗', href: `https://github.com/${r.repo}` },
      { label: 'Copy name', icon: '⧉', run: () => navigator.clipboard?.writeText(r.repo).then(() => notify.ok('Copied', r.repo), () => undefined) },
    ],
  }), [r, active])
  return (
    <motion.div ref={ref} layout className={`rp-t ${active ? 'is-on' : ''} is-${r.status}`} style={{ ['--tint' as string]: look.bg }} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05, ease: EASE, duration: 0.5 }}>
      <span className="rp-t__stub">
        <Shape kind={look.kind} color={look.color} glyph={look.glyph} size={34} play={running} />
      </span>
      <span className="rp-t__body">
        <span className="rp-t__name"><span className="mono rp-t__owner">{owner}/</span><b className="mono">{name}</b></span>
        {running && <TrailSpinner label={r.step || 'Cloning and reading history'} />}
        {failed && <span className="small" style={{ color: 'var(--stop)' }}>{r.error}</span>}
        {ready && (
          <span className="rp-t__read">
            <i>{n(r.files)} files</i><i>{n(r.symbols)} symbols</i><i>{n(r.commits)} commits</i><i>{n(r.pull_requests)} PRs</i><i>{n(r.issues)} issues</i>
          </span>
        )}
        {ready && r.github_note && <span className="rp-t__note small">Pull requests and issues were skipped: {r.github_note} Onboard it again later to fetch them.</span>}
        {ready && r.snapshot_note && <span className="rp-t__note small">{r.snapshot_note} It stays until the server restarts.</span>}
      </span>
      <span className="rp-t__end">
        {active ? (
          <span className="rp-t__here">Current</span>
        ) : ready ? (
          <button className="d-chip" onClick={onPick} data-cursor="Switch to it">Use →</button>
        ) : running ? (
          <StopButton repo={r.repo} stopping={r.step === 'Stopping'} />
        ) : (
          <span className={`d-tag ${failed ? 'is-bad' : 'is-warn'}`}>{r.status}</span>
        )}
      </span>
    </motion.div>
  )
}

/** Stops a running ingest at its next step. A first onboarding that is stopped leaves nothing on the shelf. */
function StopButton({ repo, stopping }: { repo: string; stopping: boolean }) {
  const { refreshRepos } = useDash()
  const [asked, setAsked] = useState(false)
  const busy = asked || stopping
  return (
    <motion.button
      className="rp-stop"
      disabled={busy}
      onClick={async () => {
        setAsked(true)
        try {
          await api('/api/repos/stop', { method: 'POST', body: JSON.stringify({ repo }) })
          toast({ key: `stop:${repo}`, tone: 'info', title: `Stopping ${repo}`, body: 'It stops at the next step; a first onboarding leaves nothing behind.' })
          await refreshRepos()
        } catch (e) {
          setAsked(false)
          notify.error('Could not stop it', errorText(e))
        }
      }}
      whileTap={{ scale: 0.92 }}
      data-cursor="Stop reading"
    >
      <motion.i aria-hidden animate={busy ? { rotate: 90, borderRadius: '50%' } : { rotate: 0, borderRadius: '3px' }} transition={{ type: 'spring', stiffness: 300, damping: 16 }} />
      <span>{busy ? 'Stopping…' : 'Stop'}</span>
    </motion.button>
  )
}

export default function Repos() {
  const { repos, repo, setRepo, refreshRepos, offline, recheck, checking } = useDash()
  const navigate = useNavigate()
  const { user, connectGitHub, bypass } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [gh, setGh] = useState<GhRepo[] | null>(null)
  const [ghUser, setGhUser] = useState('')
  const [ghBusy, setGhBusy] = useState(false)
  const [ghFilter, setGhFilter] = useState('')
  const [ghSort, setGhSort] = useState('pushed')
  const identity = user?.identities?.find((i) => i.provider === 'github')
  const ghLogin = (identity?.identity_data?.user_name as string | undefined) || (user?.app_metadata?.provider === 'github' ? (user?.user_metadata?.user_name as string | undefined) : undefined)
  const was = useRef<Record<string, string>>({})
  const told = useRef(new Set<string>())

  // Poll while an ingest runs, and say when one finishes.
  useEffect(() => {
    repos.forEach((r) => {
      const before = was.current[r.repo]
      if (r.status === 'running') told.current.delete(r.repo)
      if (before === 'running' && r.status === 'ready' && !told.current.has(r.repo) && told.current.add(r.repo)) toast({ key: `ready:${r.repo}`, tone: 'job', title: `${r.repo} is ready`, body: `${r.files?.toLocaleString()} files and ${r.commits?.toLocaleString()} commits read.`, action: { label: 'Use it', run: () => setRepo(r.repo) } })
      if (before === 'running' && r.status === 'failed') notify.error(`${r.repo} failed`, r.error)
      was.current[r.repo] = r.status
    })
    if (!repos.some((r) => r.status === 'running')) return
    const id = setInterval(() => refreshRepos().catch(() => undefined), 4000)
    return () => clearInterval(id)
  }, [repos, refreshRepos])

  const loadGitHub = async (login = ghLogin || ghUser) => {
    setGhBusy(true)
    setError('')
    try {
      let token = ''
      try {
        token = sessionStorage.getItem(GH_TOKEN_KEY) || ''
      } catch {
        /* ignore */
      }
      // The token only ever goes to GitHub itself, and only lists repositories.
      const url = token ? 'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member' : `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=pushed`
      if (!token && !login) throw new Error('Connect GitHub or type a GitHub username.')
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      if (!res.ok) throw new Error(res.status === 404 ? 'No such GitHub user.' : `GitHub answered ${res.status}.`)
      setGh(((await res.json()) as GhRepo[]).filter((r) => !r.private))
    } catch (e) {
      setError(errorText(e))
    } finally {
      setGhBusy(false)
    }
  }
  useEffect(() => {
    if (ghLogin) loadGitHub(ghLogin)
  }, [ghLogin])

  const onboard = async (full: string) => {
    setError('')
    if (!NAME.test(full)) {
      setError('Use the owner/name form, for example scrapy/scrapy.')
      return
    }
    try {
      // the GitHub sign-in token, when there is one, lifts this run's GitHub quota; the server uses it once and drops it
      let github_token = ''
      try {
        github_token = sessionStorage.getItem(GH_TOKEN_KEY) || ''
      } catch {
        /* private mode */
      }
      await api('/api/repos', { method: 'POST', body: JSON.stringify({ repo: full, github_token }) })
      toast({ tone: 'info', title: `Onboarding ${full}`, body: 'Code, commits, pull requests and issues are read; nothing is executed. You will hear when it is ready.' })
      setName('')
      await refreshRepos()
    } catch (e) {
      setError(errorText(e))
    }
  }

  const ghShown = useMemo(() => {
    const rows = (gh ?? []).filter((r) => !ghFilter || `${r.full_name} ${r.description ?? ''} ${r.language ?? ''}`.toLowerCase().includes(ghFilter.toLowerCase()))
    return [...rows].sort((a, b) => (ghSort === 'stars' ? b.stargazers_count - a.stargazers_count : ghSort === 'name' ? a.full_name.localeCompare(b.full_name) : b.pushed_at.localeCompare(a.pushed_at)))
  }, [gh, ghFilter, ghSort])
  const ready = repos.filter((r) => r.status === 'ready')
  
  const current = repos.find((r) => r.repo === repo)
  const others = repos.filter((r) => r.repo !== repo)
  const pick = (r: RepoInfo) => setRepo(r.repo)
  const look = current ? lookFor(current.repo) : LOOKS[0]

  const aside = (
    <>
      <Card title="GitHub" delay={0.1} aside={ghLogin ? <span className="d-tag is-ok">@{ghLogin}</span> : undefined}>
        {ghLogin ? (
          <p className="d-muted small" style={{ margin: 0 }}>Your public repositories are listed below the shelf. Connected accounts are managed in your <a href="/app/profile#security">profile</a>.</p>
        ) : (
          <div className="d-stack">
            {!bypass && <button className="btn small" onClick={() => connectGitHub().catch((e) => setError(e.message))}><span>Connect GitHub</span><span className="arrow">↗</span></button>}
            <form onSubmit={(e) => { e.preventDefault(); loadGitHub(ghUser.trim()) }} className="d-inline">
              <input className="field" value={ghUser} onChange={(e) => setGhUser(e.target.value)} placeholder="or any GitHub username" aria-label="GitHub username" />
              <button className="d-chip" type="submit">List</button>
            </form>
          </div>
        )}
      </Card>
      {ready.length > 1 && (
        <Card title="Side by side" aside={<span className="d-muted">sized by files</span>} delay={0.12}>
          <Treemap h={200} items={ready.map((r, i) => ({ label: r.repo.split('/').pop() ?? r.repo, value: r.files ?? 0, sub: `${(r.files ?? 0).toLocaleString()} files`, color: r.repo === repo ? 'var(--accent, var(--lime))' : PALETTE[i % PALETTE.length], onClick: () => pick(r) }))} />
        </Card>
      )}
      {gh && gh.length > 2 && (
        <Card title="Languages" aside={<span className="d-muted">{ghLogin ? 'yours' : `@${ghUser}`}</span>} delay={0.14}>
          <Donut size={140} thick={16} label="repositories" data={(() => {
            const m = new Map<string, number>()
            gh.forEach((r) => m.set(r.language ?? 'none', (m.get(r.language ?? 'none') ?? 0) + 1))
            return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))
          })()} onPick={(sl) => setGhFilter(sl.label === 'none' ? '' : sl.label)} />
        </Card>
      )}
    </>
  )

  return (
    <div className="d-body">
      <PageHead theme="peach" kicker="Repositories" title="Pick your" oblique="mountain" note="Onboard any public GitHub repository. Ingest reads; it never runs anything." actions={<RefreshButton busy={checking} onClick={() => recheck()} />} />
      {offline && <Note tone="error">The API is offline, so repositories cannot be listed or added. Start it with <span className="mono">bin/trailhead serve</span>.</Note>}
      {error && <Note tone="error">{error}</Note>}

      <section className="rp-camp" style={{ ['--tint' as string]: look.bg }}>
        <div className="rp-camp__mark" aria-hidden>
          <Shape kind={look.kind} color={look.color} glyph={look.glyph} size={64} play={false} />
        </div>
        <div className="rp-camp__copy">
          <span className="rp-camp__kicker">{current ? 'Basecamp' : 'No basecamp yet'}</span>
          <h2 className="mono">{current?.repo ?? 'Pick a repository'}</h2>
          {current?.status === 'ready' ? (
            <p>{n(current.files)} files and {n(current.symbols)} symbols read, with {n(current.commits)} commits, {n(current.pull_requests)} pull requests and {n(current.issues)} issues behind them.</p>
          ) : current ? (
            <p>{current.status === 'running' ? current.step || 'Reading its history…' : current.error}</p>
          ) : (
            <p>Onboard one below, or pick from your GitHub.</p>
          )}
          {current?.status === 'ready' && (
            <div className="rp-camp__go">
              <button className="btn small" onClick={() => navigate('/app/ask')}><span>Ask about it</span><span className="arrow">→</span></button>
              <button className="d-chip" onClick={() => navigate('/app/map')}>Open the map</button>
              <a className="d-chip" href={`https://github.com/${current.repo}`} target="_blank" rel="noreferrer noopener">GitHub ↗</a>
            </div>
          )}
        </div>
        <form className="rp-add" onSubmit={(e) => { e.preventDefault(); onboard(name.trim()) }}>
          <span className="rp-add__label">Onboard another</span>
          <div className="rp-add__row">
            <TypedField className="mono" value={name} onValue={setName} suggestions={REPO_EXAMPLES} placeholder="owner/name" aria-label="Repository" disabled={offline} />
            <button className="btn" type="submit" disabled={!name.trim() || offline}><span>Onboard</span><span className="arrow">→</span></button>
          </div>
          <span className="rp-add__hint">Big histories take a while. Annotations and summaries run from the command line afterwards.</span>
        </form>
      </section>

      <Split aside={aside}>
        <Card title="On the shelf" aside={<span className="d-muted">right-click one for more</span>}>
          {others.length === 0 ? (
            <Empty title={repos.length ? 'Just the one so far' : 'No repositories yet'}>Onboard another by name, or pick from GitHub.</Empty>
          ) : (
            <div className="rp-list">
              <AnimatePresence>{others.map((r, i) => <RepoTicket key={r.repo} r={r} i={i} active={false} onPick={() => pick(r)} />)}</AnimatePresence>
            </div>
          )}
        </Card>

        {(gh || ghBusy) && (
          <Card title={ghLogin ? 'From your GitHub' : `From @${ghUser}`} aside={gh && <span className="d-muted">{ghShown.length} of {gh.length}</span>}>
            {ghBusy && <TrailSpinner label="Asking GitHub" />}
            {gh && (
              <>
                <div className="d-toolbar">
                  <input className="field d-toolbar__search" placeholder="Filter by name, language or description" value={ghFilter} onChange={(e) => setGhFilter(e.target.value)} aria-label="Filter GitHub repositories" />
                  <Select label="Sort" value={ghSort} onChange={setGhSort} align="end" options={[{ value: 'pushed', label: 'Recently pushed' }, { value: 'stars', label: 'Most stars' }, { value: 'name', label: 'Name' }]} />
                </div>
                <div className="d-list d-list--scroll is-tall">
                  {ghShown.map((r, i) => {
                    const known = repos.some((x) => x.repo.toLowerCase() === r.full_name.toLowerCase())
                    return (
                      <motion.div key={r.full_name} className="d-li" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 14) * 0.02 }}>
                        <span className="d-li__lead rp-lang" style={{ ['--lang' as string]: PALETTE[[...(r.language ?? '-')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length] }}><span>{r.language ?? '—'}</span></span>
                        <span className="d-li__text">
                          <span className="d-li__title mono">{r.full_name}</span>
                          <span className="d-li__sub">{r.description || 'No description'}</span>
                        </span>
                        <span className="d-li__end">
                          <span className="rp-star">★ {r.stargazers_count}</span>
                          <button className={`d-chip ${known ? 'is-on' : ''}`} disabled={known || offline} onClick={() => onboard(r.full_name)}>{known ? 'Added ✓' : 'Onboard →'}</button>
                        </span>
                      </motion.div>
                    )
                  })}
                  {ghShown.length === 0 && <p className="d-muted small">No public repositories match.</p>}
                </div>
              </>
            )}
          </Card>
        )}
      </Split>
    </div>
  )
}
