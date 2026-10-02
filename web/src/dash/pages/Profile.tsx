import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PasskeyListItem } from '@supabase/supabase-js'
import { useAuth } from '../../lib/auth'
import { clearSaved, countSaved, exportSaved } from '../../lib/history'
import { playMoment } from '../../lib/moment'
import { removeAvatar, saveProfile, useAvatar, useProfile } from '../../lib/profile'
import { errorText, notify } from '../../lib/toast'
import { AvatarEditor } from '../AvatarEditor'
import { PhotoDial } from '../PhotoDial'
import { ProfileDetails } from '../ProfileDetails'
import { EmailCard, KeyRing, PasswordCard } from '../ProfileSecurity'
import { useSignOut } from '../Dashboard'
import { EASE, Note, PageHead } from '../ui'
import { Shape } from '../../motion/Shapes'
import { CountUp, Donut } from '../viz'
import { GitHubLogo, GoogleLogo, MailLogo } from '../../motion/Logos'

const TABS = [
  { id: 'details', label: 'Details', kind: 'circle', color: 'var(--violet)', glyph: 'pine' },
  { id: 'security', label: 'Security', kind: 'square', color: 'var(--green)', glyph: 'check' },
  { id: 'sessions', label: 'Sessions', kind: 'tag', color: 'var(--orange)', glyph: 'signal' },
  { id: 'data', label: 'Your data', kind: 'circle', color: 'var(--blue)', glyph: 'file' },
] as const

const PROVIDERS: { id: string; name: string; note: string; color: string; logo: (on: boolean) => React.ReactNode }[] = [
  { id: 'github', name: 'GitHub', note: 'Also lists your repositories for onboarding.', color: 'var(--ink)', logo: (on) => <GitHubLogo size={24} color={on ? 'var(--paper)' : 'var(--ink)'} /> },
  { id: 'google', name: 'Google', note: 'One-click sign-in with your Google account.', color: 'var(--blue)', logo: () => <GoogleLogo size={24} /> },
  { id: 'email', name: 'Email and password', note: 'Sign in with your address and a password.', color: 'var(--orange)', logo: (on) => <MailLogo size={24} color={on ? '#fff' : 'var(--ink)'} /> },
]

const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
const since = (iso?: string) => {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return d < 1 ? 'today' : d < 30 ? `${d} day${d === 1 ? '' : 's'}` : d < 365 ? `${Math.floor(d / 30)} month${d < 60 ? '' : 's'}` : `${Math.floor(d / 365)} year${d < 730 ? '' : 's'}`
}

export default function Profile() {
  const auth = useAuth()
  const { user, displayName, bypass } = auth
  const { profile, upgraded, reload } = useProfile()
  const photo = useAvatar()
  const signOutHere = useSignOut()
  const [tab, setTab] = useState<string>(window.location.hash === '#security' ? 'security' : 'details')
  const lastTab = useRef(0)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', headline: '', location: '', website: '', bio: '' })
  const [saving, setSaving] = useState(false)
  const [counts, setCounts] = useState<{ asks: number; tours: number } | null>(null)
  const [keys, setKeys] = useState<PasskeyListItem[] | null>(null)
  const [keysError, setKeysError] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState('')

  const base = useMemo(
    () => ({ display_name: profile?.display_name ?? displayName ?? '', headline: profile?.headline ?? '', location: profile?.location ?? '', website: profile?.website ?? '', bio: profile?.bio ?? '' }),
    [profile, displayName],
  )
  useEffect(() => setForm(base), [base])
  const dirty = (Object.keys(base) as (keyof typeof base)[]).some((k) => (form[k] ?? '') !== (base[k] ?? ''))

  useEffect(() => {
    countSaved().then(setCounts, () => setCounts({ asks: 0, tours: 0 }))
  }, [])

  const loadKeys = useCallback(() => {
    if (bypass) return
    auth.listPasskeys().then((k) => { setKeys(k); setKeysError('') }, (e) => { setKeys([]); setKeysError(errorText(e)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bypass])
  useEffect(loadKeys, [loadKeys])

  const identities = user?.identities ?? []
  const linked = (id: string) => identities.some((i) => i.provider === id)
  const hasPassword = linked('email')
  const checks = [
    { label: 'Email address confirmed', ok: Boolean(user?.email_confirmed_at) },
    { label: 'A passkey is saved', ok: (keys?.length ?? 0) > 0 },
    { label: 'Two or more ways to sign in', ok: identities.length + ((keys?.length ?? 0) > 0 ? 1 : 0) >= 2 },
    { label: 'Profile has a name and photo', ok: Boolean(form.display_name && photo) },
  ]
  const strength = checks.filter((c) => c.ok).length / checks.length

  const save = async () => {
    if (form.website && !/^https?:\/\//i.test(form.website)) {
      notify.error('Website needs http:// or https://')
      return false
    }
    setSaving(true)
    try {
      await saveProfile({ display_name: form.display_name.trim() || null, headline: form.headline.trim() || null, location: form.location.trim() || null, website: form.website.trim() || null, bio: form.bio.trim() || null })
      return true
    } catch (err) {
      notify.error('Profile not saved', errorText(err))
      return false
    } finally {
      setSaving(false)
    }
  }

  const addKey = async () => {
    setAdding(true)
    try {
      await auth.registerPasskey()
      await playMoment({ kind: 'passkey', name: displayName, detail: 'Passkey saved to your account' }, auth.listPasskeys().then(setKeys, () => undefined)).done
      loadKeys()
    } catch (e) {
      const msg = errorText(e)
      if (!/abort|cancel|not allowed/i.test(msg)) notify.error('Passkey not added', msg)
    } finally {
      setAdding(false)
    }
  }
  const renameKey = async (k: PasskeyListItem, name: string) => {
    if (!name.trim() || name === (k.friendly_name ?? '')) return
    try {
      await auth.renamePasskey(k.id, name.trim())
      notify.ok('Passkey renamed', name.trim())
      loadKeys()
    } catch (e) {
      notify.error('Could not rename it', errorText(e))
    }
  }
  const deleteKey = async (k: PasskeyListItem) => {
    if (!window.confirm(`Remove the passkey “${k.friendly_name || 'Passkey'}”? You will not be able to sign in with it again.`)) return
    setKeys((ks) => ks?.filter((x) => x.id !== k.id) ?? null)
    try {
      await auth.deletePasskey(k.id)
      notify.info('Passkey removed')
    } catch (e) {
      notify.error('Could not remove it', errorText(e))
      loadKeys()
    }
  }

  const run = async (key: string, fn: () => Promise<unknown>, ok: string, body?: string) => {
    setBusy(key)
    try {
      await fn()
      notify.ok(ok, body)
      return true
    } catch (e) {
      notify.error('That did not work', errorText(e))
      return false
    } finally {
      setBusy('')
    }
  }

  const download = async () => {
    try {
      const data = await exportSaved()
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), profile, ...data }, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `trailhead-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000)
      notify.ok('Export ready', `${data.asks.length} asks and ${data.tours.length} tours`)
    } catch (e) {
      notify.error('Export failed', errorText(e))
    }
  }
  const wipe = async () => {
    if (!window.confirm('Delete every saved ask and tour? This cannot be undone.')) return
    await run('wipe', clearSaved, 'History deleted')
    setCounts({ asks: 0, tours: 0 })
  }

  const first = (form.display_name || displayName).split(' ')[0] || 'hiker'
  const total = (counts?.asks ?? 0) + (counts?.tours ?? 0)

  const stamps = [
    { label: 'First ask', ok: (counts?.asks ?? 0) > 0, kind: 'tag' as const, color: 'var(--orange)', glyph: 'signal' as const },
    { label: 'First tour', ok: (counts?.tours ?? 0) > 0, kind: 'circle' as const, color: 'var(--blue)', glyph: 'flag' as const },
    { label: 'Passkey', ok: (keys?.length ?? 0) > 0, kind: 'square' as const, color: 'var(--green)', glyph: 'check' as const },
    { label: 'Full profile', ok: Boolean(form.display_name && photo && form.headline), kind: 'circle' as const, color: 'var(--violet)', glyph: 'pine' as const },
  ]
  const tabs = TABS.filter((t) => !(bypass && t.id === 'security'))
  const tabIdx = Math.max(0, tabs.findIndex((t) => t.id === tab))

  return (
    <div className="d-body">
      <PageHead kicker="Your account" title="Hello," oblique={first} note="Who you are on Trailhead, how you sign in, and what you have saved." />
      {bypass && <Note>Local mode: sign-in is off, so there is no account. Saved items live in this browser only.</Note>}
      {!bypass && !upgraded && (
        <Note>
          Your details are saved to your account for now. Full-size photos and settings sync need migration <span className="mono">0002_profile_and_avatars.sql</span>. Run it in the Supabase SQL editor, then <button className="d-chip" onClick={reload}>check again</button>
        </Note>
      )}

      <motion.section className="p-pass" initial={{ opacity: 0, y: 24, rotate: -0.6 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.7, ease: EASE }}>
        <div className="p-pass__stub">
          <PhotoDial size={132} onEdit={() => setEditing(true)} />
          {photo && <button className="p-pass__remove" onClick={() => run('photo', removeAvatar, 'Photo removed')} disabled={busy === 'photo'}>Remove photo</button>}
        </div>
        <div className="p-pass__main">
          <span className="p-pass__kind">Trail pass · {bypass ? 'local' : `No. ${(user?.id ?? '').slice(0, 8).toUpperCase()}`}</span>
          <h2 className="chunk p-pass__name">{form.display_name || displayName || 'Hiker'}</h2>
          <p className="p-pass__head">{form.headline || (bypass ? 'Exploring in local mode' : 'Add a headline in Details')}</p>
          <div className="p-pass__facts">
            {user?.email && <span><i>✉</i>{user.email}</span>}
            {form.location && <span><i>⌖</i>{form.location}</span>}
            {form.website && <a href={form.website} target="_blank" rel="noreferrer noopener"><i>↗</i>{form.website.replace(/^https?:\/\//, '')}</a>}
            <span><i>◷</i>member {since(user?.created_at)}</span>
          </div>
          <div className="p-pass__counts">
            <div><b><CountUp to={counts?.asks ?? 0} /></b><span>asks</span></div>
            <div><b><CountUp to={counts?.tours ?? 0} /></b><span>tours</span></div>
            <div><b><CountUp to={keys?.length ?? 0} /></b><span>passkeys</span></div>
          </div>
        </div>
        <div className="p-pass__stamps" aria-label="Stamps">
          {stamps.map((st, i) => (
            <motion.div key={st.label} className={`p-stamp ${st.ok ? 'is-ok' : ''}`} initial={{ scale: 1.8, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: st.ok ? [-12, 8, -6, 10][i] : 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.35 + i * 0.12 }} title={st.ok ? `${st.label}: earned` : `${st.label}: not yet`}>
              <span className="p-stamp__shape">
                <Shape kind={st.kind} color={st.ok ? st.color : 'var(--dim)'} glyph={st.glyph} size={0} style={{ width: '100%', height: 'auto' }} play={st.ok} />
              </span>
              <span className="p-stamp__label">{st.label}</span>
            </motion.div>
          ))}
        </div>
        <svg className="p-pass__trail" viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden>
          <motion.path d="M0 12 C 60 2, 110 22, 170 12 S 280 2, 340 12 S 450 22, 510 12 S 580 4, 600 10" fill="none" stroke="var(--ink)" strokeOpacity={0.25} strokeWidth={2.5} strokeDasharray="2 8" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: EASE, delay: 0.3 }} />
        </svg>
      </motion.section>

      <nav className="p-tabs" aria-label="Profile sections">
        {tabs.map((t) => (
          <button key={t.id} className={`p-tab ${t.id === tab ? 'is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.id === tab && <motion.span layoutId="p-tab" className="p-tab__bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="p-tab__icon"><Shape kind={t.kind} color={t.color} glyph={t.glyph} size={22} play={false} /></span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} className="p-panel" initial={{ opacity: 0, x: 30 * (tabIdx >= lastTab.current ? 1 : -1) }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3, ease: EASE }} onAnimationComplete={() => { lastTab.current = tabIdx }}>
          {tab === 'details' && (
            <ProfileDetails form={form} setForm={setForm} base={base} dirty={dirty} saving={saving} onSave={save} defaultName={displayName} />
          )}

          {tab === 'security' && !bypass && (
            <div className="p-grid">
              <div className={`p-card p-shield is-wide ${strength === 1 ? 'is-full' : ''}`}>
                <ShieldArt checks={checks.map((c) => c.ok)} />
                <div className="p-shield__copy">
                  <h3 className="chunk">{strength === 1 ? 'Your account is locked tight' : strength >= 0.5 ? 'Almost locked tight' : 'Let’s lock this down'}</h3>
                  <p className="d-muted">{strength === 1 ? 'Every lock is in place. Nothing to do here.' : 'Each lock you add makes the shield whole. Tap one to set it up.'}</p>
                  <div className="p-locks">
                    {checks.map((c, i) => (
                      <motion.button
                        key={c.label}
                        type="button"
                        className={`p-lock ${c.ok ? 'is-ok' : ''}`}
                        initial={{ opacity: 0, y: 14, scale: 0.94 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: 0.15 + i * 0.09, type: 'spring', stiffness: 320, damping: 24 }}
                        whileHover={c.ok ? undefined : { y: -3 }}
                        disabled={c.ok}
                        onClick={() => (i === 1 ? addKey() : i === 3 ? setTab('details') : i === 2 ? document.getElementById('password')?.focus() : undefined)}
                      >
                        <span className="p-lock__mark">
                          <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
                            {c.ok ? (
                              <motion.path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45 + i * 0.12, duration: 0.45, ease: EASE }} />
                            ) : (
                              <path d="M12 6v12M6 12h12" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
                            )}
                          </svg>
                        </span>
                        <span>{c.label}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-card is-wide">
                <div className="p-card__head"><h3 className="chunk">Ways to sign in</h3></div>
                <div className="p-providers">
                  {PROVIDERS.map((pr, i) => {
                    const on = linked(pr.id)
                    const ident = identities.find((x) => x.provider === pr.id)
                    return (
                      <motion.div key={pr.id} className={`p-provider ${on ? 'is-on' : ''}`} style={{ ['--pc' as string]: pr.color }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05, ease: EASE }}>
                        <span className={`p-provider__icon is-${pr.id}`}>{pr.logo(on)}</span>
                        <b>{pr.name}</b>
                        <span className="d-muted">{on ? `Connected ${day(ident?.created_at)}${ident?.identity_data?.user_name ? ` · @${ident.identity_data.user_name}` : ''}` : pr.note}</span>
                        <span className="p-provider__act">
                          {on ? (
                            <button className="d-chip is-danger" disabled={identities.length < 2 || busy === pr.id} onClick={() => window.confirm(`Disconnect ${pr.name}?`) && run(pr.id, () => auth.unlinkProvider(pr.id), `${pr.name} disconnected`)} data-cursor={identities.length < 2 ? 'Your only sign-in method' : 'Disconnect'}>Disconnect</button>
                          ) : pr.id === 'github' ? (
                            <button className="d-chip" onClick={() => auth.connectGitHub().catch((e) => notify.error('Could not start linking', errorText(e)))}>Connect ↗</button>
                          ) : pr.id === 'email' ? (
                            <button className="d-chip" onClick={() => document.getElementById('password')?.focus()}>Set a password</button>
                          ) : (
                            <span className="d-tag is-soft">off for now</span>
                          )}
                        </span>
                      </motion.div>
                    )
                  })}
                </div>
              </div>

              <KeyRing keys={keys} error={keysError} adding={adding} onAdd={addKey} onRename={renameKey} onDelete={deleteKey} />
              <EmailCard current={user?.email ?? ''} busy={busy === 'email'} onSend={(addr) => run('email', () => auth.updateEmail(addr), 'Check both inboxes', 'Confirm the change from the links sent to your old and new addresses.')} />
              <PasswordCard has={hasPassword} busy={busy === 'pw'} onSave={(pw) => run('pw', () => auth.updatePassword(pw), hasPassword ? 'Password changed' : 'Password set', 'You can now sign in with your email and this password.')} />
            </div>
          )}

          {tab === 'sessions' && (
            <div className="p-grid">
              <div className="p-card p-device is-here">
                <span className="p-device__screen"><span className="p-session__dot" /></span>
                <b>This browser</b>
                <span className="d-muted">{navigator.userAgent.includes('Mac') ? 'macOS' : navigator.userAgent.includes('Windows') ? 'Windows' : 'This device'} · signed in {day(user?.last_sign_in_at)}</span>
                <button className="d-chip" onClick={() => signOutHere('local')}>{bypass ? 'Leave local mode' : 'Sign out here'}</button>
              </div>
              {!bypass && (
                <div className="p-card p-device">
                  <span className="p-device__screen is-many"><i /><i /><i /></span>
                  <b>Everywhere else</b>
                  <span className="d-muted">Phones, other browsers and computers you signed in on.</span>
                  <div className="s-btns">
                    <button className="d-chip" disabled={busy === 'others'} onClick={() => run('others', () => auth.signOut('others'), 'Signed out of other devices', 'This browser stays signed in.')}>Sign out others</button>
                    <button className="d-chip is-danger" onClick={() => signOutHere('global')}>Sign out everywhere</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'data' && (
            <div className="p-grid">
              <div className="p-card p-data">
                {total > 0 ? (
                  <Donut size={150} thick={18} label="saved" data={[{ label: 'Asks', value: counts?.asks ?? 0, color: 'var(--blue)' }, { label: 'Tours', value: counts?.tours ?? 0, color: 'var(--green)' }]} />
                ) : (
                  <p className="d-muted">Nothing saved yet. Asks and tours you run are kept here{bypass ? ' in this browser' : ' on your account'}.</p>
                )}
              </div>
              <div className="p-card p-mini-form">
                <h3 className="chunk">Take it with you</h3>
                <span className="d-muted">Every ask, tour and your profile as one JSON file.</span>
                <button className="btn small" onClick={download}><span>Download everything</span><span className="arrow">↓</span></button>
                <button className="d-chip is-danger" onClick={wipe} disabled={!total || busy === 'wipe'}>Delete saved history</button>
                <Link to="/app/settings#data" className="d-more">More in Settings →</Link>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AvatarEditor open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}

/* The account shield: four plates, one per lock. Plates you have earned slide in and colour up; the check draws once
   the shield is whole. Gentle float keeps it alive without counting anything. */
function ShieldArt({ checks }: { checks: boolean[] }) {
  const full = checks.every(Boolean)
  const plates = ['var(--violet)', 'var(--orange)', 'var(--blue)', 'var(--yellow)']
  const quads = ['M60 14 L60 64 L18 64 L18 30 Z', 'M60 14 L102 30 L102 64 L60 64 Z', 'M18 64 L60 64 L60 124 C38 114 22 96 18 64 Z', 'M60 64 L102 64 C98 96 82 114 60 124 Z']
  const from = [[-18, -18], [18, -18], [-18, 18], [18, 18]]
  return (
    <motion.div className="p-shield__art" animate={{ y: [0, -6, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} aria-hidden>
      <svg viewBox="0 0 120 136" width={150} height={170}>
        <defs>
          <clipPath id="p-shield-clip"><path d="M60 8 L108 26 L108 64 C108 98 88 120 60 130 C32 120 12 98 12 64 L12 26 Z" /></clipPath>
        </defs>
        <path d="M60 8 L108 26 L108 64 C108 98 88 120 60 130 C32 120 12 98 12 64 L12 26 Z" fill="var(--surface)" stroke="var(--dim)" strokeWidth={3} strokeDasharray="4 6" />
        <g clipPath="url(#p-shield-clip)">
          {quads.map((d, i) =>
            checks[i] ? (
              <motion.path key={i} d={d} fill={plates[i]} stroke="var(--card)" strokeWidth={3} initial={{ x: from[i][0], y: from[i][1], opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.14, type: 'spring', stiffness: 220, damping: 18 }} />
            ) : null,
          )}
        </g>
        <motion.path d="M60 8 L108 26 L108 64 C108 98 88 120 60 130 C32 120 12 98 12 64 L12 26 Z" fill="none" stroke="var(--ink)" strokeWidth={4} strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE }} />
        {full && (
          <>
            <motion.circle cx={60} cy={66} r={22} fill="var(--ink)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 300, damping: 16 }} style={{ transformOrigin: '60px 66px' }} />
            <motion.path d="M50 66 l7 7 l14 -15" fill="none" stroke="var(--paper)" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.15, duration: 0.4, ease: EASE }} />
          </>
        )}
      </svg>
      {full &&
        [0, 1, 2, 3, 4, 5].map((i) => (
          <motion.span key={i} className="p-shield__spark" style={{ background: plates[i % 4], left: `${50 + 46 * Math.cos((i / 6) * Math.PI * 2)}%`, top: `${48 + 44 * Math.sin((i / 6) * Math.PI * 2)}%` }} animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }} transition={{ duration: 2.4, repeat: Infinity, delay: 1.2 + i * 0.3, ease: 'easeInOut' }} />
        ))}
    </motion.div>
  )
}
