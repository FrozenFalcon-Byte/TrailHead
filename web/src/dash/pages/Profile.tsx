import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { Card, Note, PageHead } from '../ui'

export default function Profile() {
  const { user, displayName, avatar, signOut, connectGitHub, bypass } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState(displayName)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const providers = user?.identities?.map((i) => i.provider) ?? []

  const save = async () => {
    if (!supabase) return
    const { error } = await supabase.auth.updateUser({ data: { full_name: name } })
    if (!error) await supabase.from('profiles').upsert({ id: user?.id, display_name: name })
    setMsg(error ? { tone: 'error', text: error.message } : { tone: 'ok', text: 'Saved.' })
  }

  return (
    <>
      <PageHead theme="plum" kicker="Profile" title="Hello," oblique={displayName.split(' ')[0] || 'hiker'} />
      <div className="d-body" style={{ maxWidth: 820 }}>
        {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        {bypass && <Note>Local mode: sign-in is off, so there is no account and saved items live in this browser only.</Note>}
        <Card title="You">
          <div className="d-row" style={{ gap: 18, alignItems: 'center' }}>
            {avatar ? <img src={avatar} alt="" width={72} height={72} style={{ borderRadius: 18 }} referrerPolicy="no-referrer" /> : <span style={{ width: 72, height: 72, borderRadius: 18, background: 'var(--plum)', color: 'var(--heather)', display: 'grid', placeItems: 'center', fontFamily: 'var(--display)', fontSize: 36 }}>{(displayName || '?')[0].toUpperCase()}</span>}
            <div style={{ display: 'grid', gap: 4 }}>
              <b>{user?.email ?? 'local developer'}</b>
              <span className="small" style={{ opacity: 0.6 }}>signed in with {providers.join(', ') || (bypass ? 'nothing (local mode)' : 'email')}</span>
            </div>
          </div>
          {!bypass && (
            <div className="d-row" style={{ marginTop: 16 }}>
              <input className="field" style={{ maxWidth: 320, ['--fg' as string]: 'var(--ink)' }} value={name} onChange={(e) => setName(e.target.value)} aria-label="Display name" />
              <button className="btn" onClick={save} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}><span>Save name</span><span className="arrow">→</span></button>
            </div>
          )}
        </Card>
        {!bypass && (
          <Card title="Connected accounts">
            <div className="d-row">
              {(['github', 'google', 'email'] as const).map((p) => (
                <span key={p} className="d-badge" style={{ background: providers.includes(p) ? 'var(--pine)' : 'var(--paper-2)', color: 'var(--ink)', fontSize: 15 }}>{p} {providers.includes(p) ? '✓' : ''}</span>
              ))}
              {!providers.includes('github') && <button className="d-chip" onClick={() => connectGitHub().catch((e) => setMsg({ tone: 'error', text: e.message }))}>Connect GitHub ↗</button>}
            </div>
          </Card>
        )}
        <Card title="Leave the trail">
          <button className="btn" onClick={async () => { await signOut(); navigate('/') }} style={{ ['--fg' as string]: 'var(--ink)', ['--bg' as string]: 'var(--paper)' }}><span>{bypass ? 'Back to the landing page' : 'Sign out'}</span><span className="arrow">→</span></button>
        </Card>
      </div>
    </>
  )
}
