import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { TrailSpinner } from '../../motion/TrailSpinner'
import { GH_TOKEN_KEY } from '../../pages/AuthCallback'
import { useDash, type RepoInfo } from '../context'
import { Card, EASE, Note, PageHead } from '../ui'

type GhRepo = { full_name: string; description: string | null; stargazers_count: number; language: string | null; private: boolean; html_url: string; pushed_at: string }
const NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function RepoTile({ r, active, onPick, i }: { r: RepoInfo; active: boolean; onPick: () => void; i: number }) {
  const running = r.status === 'running'
  const failed = r.status === 'failed'
  return (
    <motion.button onClick={onPick} disabled={r.status !== 'ready'} initial={{ opacity: 0, y: 20, rotate: i % 2 ? 1.5 : -1.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: i * 0.06, ease: EASE, duration: 0.6 }} whileHover={r.status === 'ready' ? { y: -5 } : undefined}
      className={active ? 't-pine' : 'd-card'} style={{ textAlign: 'left', border: 0, borderRadius: 'var(--radius)', padding: 20, cursor: r.status === 'ready' ? 'pointer' : 'default', display: 'grid', gap: 8 }}>
      <span className="d-row" style={{ justifyContent: 'space-between' }}>
        <span className="mono" style={{ fontWeight: 800, fontSize: 17 }}>{r.repo}</span>
        <span className="d-badge" style={{ background: failed ? 'var(--danger)' : running ? 'var(--blaze)' : active ? 'var(--pine)' : 'var(--paper-2)', color: 'var(--ink)' }}>{active ? 'current' : r.status}</span>
      </span>
      {running && <TrailSpinner label="Cloning and reading history. This can take a few minutes." />}
      {failed && <span className="small" style={{ color: '#7a1408' }}>{r.error}</span>}
      {r.status === 'ready' && (
        <span className="small" style={{ opacity: 0.75 }}>
          {r.files?.toLocaleString()} files · {r.symbols?.toLocaleString()} symbols · {r.commits?.toLocaleString()} commits · {r.pull_requests?.toLocaleString()} PRs · {r.issues?.toLocaleString()} issues
        </span>
      )}
    </motion.button>
  )
}

export default function Repos() {
  const { repos, repo, setRepo, refreshRepos } = useDash()
  const { user, connectGitHub, bypass } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [gh, setGh] = useState<GhRepo[] | null>(null)
  const [ghUser, setGhUser] = useState('')
  const [ghBusy, setGhBusy] = useState(false)
  const identity = user?.identities?.find((i) => i.provider === 'github')
  const ghLogin = (identity?.identity_data?.user_name as string | undefined) || (user?.app_metadata?.provider === 'github' ? (user?.user_metadata?.user_name as string | undefined) : undefined)

  // Poll while an ingest runs.
  useEffect(() => {
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
      const url = token ? 'https://api.github.com/user/repos?per_page=60&sort=pushed&affiliation=owner,collaborator,organization_member' : `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=60&sort=pushed`
      if (!token && !login) throw new Error('Connect GitHub or type a GitHub username.')
      const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
      if (!res.ok) throw new Error(res.status === 404 ? 'No such GitHub user.' : `GitHub answered ${res.status}.`)
      setGh(((await res.json()) as GhRepo[]).filter((r) => !r.private))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setGhBusy(false)
    }
  }
  useEffect(() => {
    if (ghLogin) loadGitHub(ghLogin)
  }, [ghLogin])

  const onboard = async (full: string) => {
    setError('')
    setInfo('')
    if (!NAME.test(full)) {
      setError('Use the owner/name form, for example scrapy/scrapy.')
      return
    }
    try {
      await api('/api/repos', { method: 'POST', body: JSON.stringify({ repo: full }) })
      setInfo(`Onboarding ${full}. Code, commits, pull requests and issues are read; nothing in the repository is ever executed.`)
      setName('')
      await refreshRepos()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <PageHead theme="paper" kicker="Repositories" title="Pick your" oblique="mountain" note="onboard any public GitHub repository — ingest reads, it never runs" />
      <div className="d-body">
        {error && <Note tone="error">{error}</Note>}
        {info && <Note tone="ok">{info}</Note>}
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
          {repos.map((r, i) => <RepoTile key={r.repo} r={r} i={i} active={r.repo === repo} onPick={() => setRepo(r.repo)} />)}
        </div>

        <Card title="Add a repository" theme="pine">
          <form onSubmit={(e) => { e.preventDefault(); onboard(name.trim()) }} className="d-ask">
            <input className="field mono" value={name} onChange={(e) => setName(e.target.value)} placeholder="owner/name" aria-label="Repository" />
            <button className="btn" type="submit" disabled={!name.trim()}><span>Onboard</span><span className="arrow">→</span></button>
          </form>
          <p className="small" style={{ opacity: 0.75, marginTop: 10 }}>Tip: big histories take a while to fetch from GitHub. Annotations and summaries run from the command line afterwards.</p>
        </Card>

        <Card title="From your GitHub" aside={ghLogin && <span className="small">connected as <b>@{ghLogin}</b></span>}>
          {!ghLogin && (
            <div className="d-row" style={{ marginBottom: 14 }}>
              {!bypass && (
                <button className="btn" onClick={() => connectGitHub().catch((e) => setError(e.message))} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}>
                  <span>Connect GitHub</span><span className="arrow">↗</span>
                </button>
              )}
              <span className="small" style={{ opacity: 0.6 }}>{bypass ? 'Local mode: type a username to list public repositories.' : 'or list anyone’s public repositories:'}</span>
              <form onSubmit={(e) => { e.preventDefault(); loadGitHub(ghUser.trim()) }} className="d-row">
                <input className="field" style={{ width: 200, padding: '10px 14px', fontSize: 15, ['--fg' as string]: 'var(--ink)' }} value={ghUser} onChange={(e) => setGhUser(e.target.value)} placeholder="github username" aria-label="GitHub username" />
                <button className="d-chip" type="submit">List</button>
              </form>
            </div>
          )}
          {ghBusy && <TrailSpinner label="Asking GitHub" />}
          {gh && (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {gh.map((r, i) => {
                const known = repos.some((x) => x.repo.toLowerCase() === r.full_name.toLowerCase())
                return (
                  <motion.div key={r.full_name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 20) * 0.03 }} style={{ padding: 14, borderRadius: 14, background: 'var(--paper-2)', display: 'grid', gap: 6 }}>
                    <span className="mono" style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.full_name}</span>
                    <span className="small" style={{ opacity: 0.7, minHeight: 18 }}>{r.description?.slice(0, 110)}</span>
                    <span className="d-row small" style={{ justifyContent: 'space-between' }}>
                      <span style={{ opacity: 0.6 }}>{r.language ?? '—'} · ★ {r.stargazers_count}</span>
                      <button className="d-chip" disabled={known} onClick={() => onboard(r.full_name)} style={{ padding: '5px 12px' }}>{known ? 'Added' : 'Onboard →'}</button>
                    </span>
                  </motion.div>
                )
              })}
              {gh.length === 0 && <p className="small">No public repositories found.</p>}
            </div>
          )}
          {ghLogin && !gh && !ghBusy && <button className="d-chip" onClick={() => loadGitHub()}>Load my repositories</button>}
        </Card>
      </div>
    </>
  )
}
