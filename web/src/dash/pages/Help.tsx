import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { countSaved } from '../../lib/history'
import { useAvatar } from '../../lib/profile'
import { notify } from '../../lib/toast'
import { Shape } from '../../motion/Shapes'
import { useDash } from '../context'
import { NAV, PROFILE, SETTINGS } from '../nav'
import { EASE, PageHead } from '../ui'

/* Plain-language help for the whole dashboard. Search filters the guides and answers as you type; the first-trail
   checklist and the system check read live state, so this page reflects your own setup. */

const PAGE_NOTES: Record<string, string> = {
  '/app': 'Your home base: what changed, where you left off, and three good next steps.',
  '/app/ask': 'Ask where, how or why about the codebase. Every claim cites its evidence and shows how sure it is.',
  '/app/tour': 'Say what you want to build or fix. Get an ordered reading path through the files that matter.',
  '/app/find': 'Describe a file in plain words and get the file, the function, and a confidence for each.',
  '/app/issues': 'Open issues nobody has fixed yet, ranked by how gentle a first contribution they make.',
  '/app/map': 'Browse the folder tree with the short summaries Jev reads as it walks it.',
  '/app/decisions': 'An audit log of every judgement Jev made, its probabilities, and whether it came from the cache.',
  '/app/evals': 'Benchmarks for finding files, tours, hostile text and why-answers. Every number can be rebuilt.',
  '/app/repos': 'Add any public GitHub repository. Trailhead reads it; it never runs its code.',
  '/app/profile': 'Your name and photo, how you sign in, passkeys, active sessions and your saved data.',
  '/app/settings': 'Look and feel, motion, notifications, the default engine and keyboard shortcuts.',
}

type Faq = { q: string; a: ReactNode; text: string; topic: string }
const faq = (topic: string, q: string, a: ReactNode, text: string): Faq => ({ topic, q, a, text })

const FAQ: Faq[] = [
  faq('Getting started', 'What is Trailhead?', <>A guide for finding your way into an unfamiliar codebase. Point it at a GitHub repository and a goal, and it gives back a reading path through the files that matter, plus cited answers to where, how and why questions.</>, 'onboarding tour answers codebase github'),
  faq('Getting started', 'How do I add a repository?', <>Open <Link to="/app/repos">Repositories</Link> and type <span className="mono">owner/name</span>. Trailhead clones it and reads its pull requests, issues and commits. It never runs the repository’s code, and it skips <span className="mono">.env</span> and secret-looking files.</>, 'repository add ingest clone owner name'),
  faq('Getting started', 'Ask, Tour or Find: which one do I want?', <><b>Ask</b> when you have a question (“why does the retry middleware skip 404s?”). <b>Tour</b> when you have a task (“add a per-request retry limit”). <b>Find</b> when you know roughly what a file does but not where it lives.</>, 'ask tour find difference which'),
  faq('Answers and tours', 'What do the percentages next to claims mean?', <>Each one is the probability that the cited evidence really supports the claim. Claims without evidence, or citing passages that were not kept, are removed before you see them.</>, 'percentage probability claim confidence calibrated'),
  faq('Answers and tours', 'Why did it say it isn’t sure?', <>When the record is too thin to support an answer, Trailhead holds back instead of guessing. Try a narrower question, or ask about a specific file or pull request.</>, 'abstain not sure unsure no answer'),
  faq('Answers and tours', 'What do “confident” and “tentative” mean?', <>When finding a file, Trailhead compares its best path with the runner-up. A wide gap means confident; a narrow one means tentative, so check a second option.</>, 'confident tentative beam separation'),
  faq('Answers and tours', 'What is Jev?', <>TypeSafe’s decision model, called through BeatAPI. Jev makes every judgement: which folder to open, whether a passage is relevant, whether text is trying to steer the model, and whether a claim is supported. A separate language model only writes the prose, and only from evidence Jev kept.</>, 'jev model beatapi typesafe decide llm'),
  faq('Speed and limits', 'Why is it slow sometimes?', <>Jev on the free tier answers about one request a minute. The <b>Jev slot</b> meter at the bottom of the sidebar shows when the next call is free. Every call is cached, so asking the same thing again is instant.</>, 'slow wait rate limit slot meter free tier cache'),
  faq('Speed and limits', 'Can I use a different engine?', <>Yes. The engine picker in the top bar lists every engine your server has set up. Set the default in <Link to="/app/settings#engine">Settings → Engine</Link>.</>, 'engine switch llm local ollama default'),
  faq('Speed and limits', 'The API says it is offline', <>The dashboard talks to the Trailhead server on your machine. Start it with <span className="mono">bin/trailhead serve</span>, then use the system check further down this page.</>, 'offline api server down connection error'),
  faq('Privacy and security', 'Is my code sent anywhere?', <>Only the passages needed for a decision go to the decision engine or language model. Before anything leaves your machine, anything that looks like a key, token or credentialed URL is redacted.</>, 'privacy code sent secrets redaction key token'),
  faq('Privacy and security', 'Can a repository trick the model?', <>Trailhead treats repository text as data. Jev screens every retrieved passage for text aimed at an AI and drops what it flags; a final guard checks answers for instructions taken from the repository. See the <Link to="/app/evals#injection">Hostile text</Link> results.</>, 'prompt injection hostile attack trick'),
  faq('Privacy and security', 'Where are my saved asks and tours?', <>In your account, where row-level security keeps your rows private. In local mode they stay in this browser. Download or delete them under <Link to="/app/profile">Profile → Your data</Link>.</>, 'history saved data delete export download'),
  faq('Account', 'How do I add a passkey?', <>Go to <Link to="/app/profile#security">Profile → Security</Link> and choose <b>Add a passkey</b>. Your device asks for your fingerprint, face or PIN, and next time you can skip the password.</>, 'passkey fingerprint face biometric'),
  faq('Account', 'How do I sign in another way?', <>Connect GitHub or set a password under <Link to="/app/profile#security">Profile → Security</Link>. Keep at least two ways to sign in so you are never locked out. Google sign-in is off for now.</>, 'sign in github google password email login'),
  faq('Account', 'How do I change how it looks?', <>Use <Link to="/app/settings">Settings → Appearance</Link> for colour, size and layout, and the switch in the bottom corner for light or dark.</>, 'theme dark light appearance colour font size'),
]

const KEYS = [
  { keys: ['G', '…'], label: 'Jump to a page: G then the page letter' },
  { keys: ['/'], label: 'Focus the search or question box' },
  { keys: ['R'], label: 'Refresh the current page' },
  { keys: [','], label: 'Open Settings' },
  { keys: ['?'], label: 'Show the shortcut list' },
]

function useMatch(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return (...hay: string[]) => {
    if (!words.length) return true
    const all = hay.join(' ').toLowerCase()
    return words.every((w) => all.includes(w))
  }
}

function FirstTrail() {
  const { repos } = useDash()
  const { displayName } = useAuth()
  const photo = useAvatar()
  const [counts, setCounts] = useState<{ asks: number; tours: number } | null>(null)
  useEffect(() => {
    countSaved().then(setCounts, () => setCounts({ asks: 0, tours: 0 }))
  }, [])
  const steps = [
    { item: NAV[8], title: 'Add a repository', done: repos.some((r) => r.status === 'ready'), line: 'Pick any public GitHub repository.' },
    { item: NAV[1], title: 'Ask a question', done: (counts?.asks ?? 0) > 0, line: 'Where, how or why: start small.' },
    { item: NAV[2], title: 'Take a guided tour', done: (counts?.tours ?? 0) > 0, line: 'Describe a task, get a reading path.' },
    { item: PROFILE, title: 'Finish your profile', done: Boolean(displayName && photo), line: 'A name and a photo for your pass.' },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <section className="h-trail">
      <div className="h-trail__head">
        <h2 className="chunk">{next === -1 ? 'You’ve walked the whole first trail' : 'Your first trail'}</h2>
        <p className="d-muted">{next === -1 ? 'Everything below is here when you need it.' : 'Four stops to get going. They tick themselves off as you go.'}</p>
      </div>
      <div className="h-trail__steps">
        <svg className="h-trail__path" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden>
          <motion.path d="M20 20 C 150 0, 250 40, 375 20 S 600 0, 625 20 S 850 40, 980 20" fill="none" stroke="var(--dim)" strokeWidth={4} strokeDasharray="3 12" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: EASE }} />
        </svg>
        {steps.map((s, i) => (
          <motion.div key={s.title} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, ease: EASE, duration: 0.5 }}>
            <Link to={s.item.to} className={`h-step ${s.done ? 'is-done' : ''} ${i === next ? 'is-next' : ''}`} style={{ ['--c' as string]: s.item.color, ['--bg' as string]: s.item.bg }}>
              <span className="h-step__icon">
                <Shape kind={s.item.kind} color={s.item.color} glyph={s.item.glyph} size={44} play={i === next} />
                {s.done && (
                  <motion.span className="h-step__tick" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 400, damping: 16 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </motion.span>
                )}
              </span>
              <b>{s.title}</b>
              <span className="d-muted small">{s.done ? 'Done' : s.line}</span>
              {i === next && <span className="h-step__go">Start here →</span>}
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/** How a question becomes an answer, as a small looping diagram. */
function HowItWorks() {
  const stages = [
    { kind: 'square' as const, color: 'var(--violet)', glyph: 'grep' as const, title: 'Jev decides', text: 'Walks the folder tree, keeps relevant passages, and drops any that try to steer the model.' },
    { kind: 'tag' as const, color: 'var(--orange)', glyph: 'signal' as const, title: 'The writer drafts', text: 'A language model writes the answer, using only the evidence Jev kept.' },
    { kind: 'circle' as const, color: 'var(--green)', glyph: 'check' as const, title: 'Every claim is checked', text: 'Jev scores each claim against its citation. Unsupported claims are removed, and thin answers become an honest “not sure”.' },
  ]
  return (
    <section className="h-how">
      <h2 className="chunk">How an answer is made</h2>
      <div className="h-how__flow">
        <svg className="h-how__line" viewBox="0 0 1000 20" preserveAspectRatio="none" aria-hidden>
          <path d="M60 10 H 940" stroke="var(--dim)" strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" fill="none" />
        </svg>
        <motion.span className="h-how__dot" animate={{ left: ['8%', '50%', '92%', '92%'], opacity: [0, 1, 1, 0] }} transition={{ duration: 4.2, times: [0, 0.45, 0.9, 1], repeat: Infinity, ease: 'easeInOut' }} aria-hidden />
        {stages.map((st, i) => (
          <motion.div key={st.title} className="h-how__stage" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.12, ease: EASE }}>
            <span className="h-how__icon"><Shape kind={st.kind} color={st.color} glyph={st.glyph} size={52} /></span>
            <b>{st.title}</b>
            <p className="d-muted">{st.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Keys() {
  const [down, setDown] = useState('')
  useEffect(() => {
    let t = 0
    const on = (e: KeyboardEvent) => {
      setDown(e.key.toUpperCase())
      window.clearTimeout(t)
      t = window.setTimeout(() => setDown(''), 600)
    }
    window.addEventListener('keydown', on)
    return () => {
      window.removeEventListener('keydown', on)
      window.clearTimeout(t)
    }
  }, [])
  const letters = [...NAV, PROFILE, SETTINGS].map((n) => ({ k: n.key.toUpperCase(), label: n.label }))
  return (
    <section className="h-card h-keys">
      <h3 className="chunk">Keyboard shortcuts</h3>
      <p className="d-muted small">Try one now: the key lights up as you press it.</p>
      <ul className="h-keys__list">
        {KEYS.map((k) => (
          <li key={k.label}>
            <span className="h-keys__caps">{k.keys.map((c) => <kbd key={c} className={down === c ? 'is-down' : ''}>{c}</kbd>)}</span>
            <span>{k.label}</span>
          </li>
        ))}
      </ul>
      <div className="h-keys__pages">
        {letters.map((l) => (
          <span key={l.k} className="h-keys__page"><kbd className={down === l.k ? 'is-down' : ''}>{l.k}</kbd>{l.label}</span>
        ))}
        <span className="h-keys__page"><kbd className={down === 'H' ? 'is-down' : ''}>H</kbd>Help</span>
      </div>
    </section>
  )
}

function SystemCheck() {
  const { recheck, checking, health, repos, repo, engine, nextSlot, config } = useDash()
  const { bypass, user } = useAuth()
  const [ran, setRan] = useState(false)
  const [ok, setOk] = useState<boolean | null>(null)
  const run = async () => {
    setRan(false)
    const answered = await recheck()
    setOk(answered)
    setRan(true)
  }
  const current = repos.find((r) => r.repo === repo)
  const rows = [
    { label: 'Trailhead server', good: ok !== false, line: ok === false ? 'Not answering. Start it with bin/trailhead serve.' : 'Answering requests.' },
    { label: 'Repository', good: current?.status === 'ready', line: !repo ? 'None picked. Add one under Repositories.' : current?.status === 'ready' ? `${repo} is ready.` : current?.status === 'running' ? `${repo} is still being read.` : current?.status === 'failed' ? `${repo} failed: ${current.error ?? 'see Repositories'}.` : `${repo} is not loaded yet.` },
    { label: 'Decision engine', good: Boolean(engine || health?.default_engine), line: `${engine || health?.default_engine || 'none'}${config?.offline ? ' · answering from the cache only' : ''}` },
    { label: 'Jev slot', good: nextSlot < 0.5 || (engine || health?.default_engine) !== 'jev', line: nextSlot >= 0.5 && (engine || health?.default_engine) === 'jev' ? `Next call is free in about ${Math.ceil(nextSlot)}s.` : 'Ready for the next call.' },
    { label: 'Account', good: bypass || Boolean(user), line: bypass ? 'Local mode: saved items stay in this browser.' : user?.email ? `Signed in as ${user.email}.` : 'Signed in.' },
  ]
  const report = () => {
    const text = ['Trailhead system check', `Time: ${new Date().toISOString()}`, ...rows.map((r) => `${r.good ? 'OK ' : 'NO '} ${r.label}: ${r.line.replace(/Signed in as .*/, 'Signed in.')}`), `Page: ${location.pathname}`, `Browser: ${navigator.userAgent}`].join('\n')
    navigator.clipboard?.writeText(text).then(() => notify.ok('Report copied', 'Paste it wherever you are asking for help.'), () => notify.error('Could not copy the report'))
  }
  return (
    <section className="h-card h-check">
      <div className="h-check__head">
        <div>
          <h3 className="chunk">Still stuck?</h3>
          <p className="d-muted small">Run a check of your setup. Copy the report to share it; it never includes keys or your email.</p>
        </div>
        <div className="h-check__acts">
          <button className="btn small" onClick={run} disabled={checking}><span>{checking ? 'Checking…' : ran ? 'Check again' : 'Run a check'}</span></button>
          {ran && <button className="d-chip" onClick={report}>Copy report</button>}
        </div>
      </div>
      <AnimatePresence>
        {ran && (
          <motion.ul className="h-check__list" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35, ease: EASE }}>
            {rows.map((r, i) => (
              <motion.li key={r.label} className={r.good ? 'is-good' : 'is-bad'} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i, ease: EASE }}>
                <span className="h-check__mark">{r.good ? '✓' : '!'}</span>
                <b>{r.label}</b>
                <span className="d-muted small">{r.line}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  )
}

export default function Help() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(FAQ[0].q)
  const [topic, setTopic] = useState('All')
  const match = useMatch(query)
  const topics = ['All', ...Array.from(new Set(FAQ.map((f) => f.topic)))]
  const pages = [...NAV, PROFILE, SETTINGS].filter((n) => match(n.label, PAGE_NOTES[n.to] ?? ''))
  const answers = FAQ.filter((f) => (query || topic === 'All' || f.topic === topic) && match(f.q, f.text, f.topic))
  const searching = query.trim().length > 0

  return (
    <div className="d-body">
      <PageHead kicker="Help" title="Find your" oblique="footing" note="How Trailhead works, what every page does, and answers to the questions people ask most.">
        <label className="d-ask h-search">
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search help: try “passkey”, “slow” or “tour”" aria-label="Search help" />
          {query && <button className="d-chip" onClick={() => setQuery('')}>Clear</button>}
        </label>
      </PageHead>

      {!searching && <FirstTrail />}
      {!searching && <HowItWorks />}

      {pages.length > 0 && (
        <section className="h-pages">
          <h2 className="chunk">{searching ? 'Pages' : 'What every page does'}</h2>
          <div className="h-pages__grid">
            {pages.map((n, i) => (
              <motion.div key={n.to} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04, ease: EASE }}>
                <Link to={n.to} className="h-page" style={{ ['--c' as string]: n.color, ['--bg' as string]: n.bg }}>
                  <span className="h-page__icon"><Shape kind={n.kind} color={n.color} glyph={n.glyph} size={36} play={false} /></span>
                  <b>{n.label}</b>
                  <span className="d-muted small">{PAGE_NOTES[n.to]}</span>
                  <span className="h-page__foot">
                    <span className="h-page__key"><kbd>G</kbd><kbd>{n.key.toUpperCase()}</kbd></span>
                    <span className="h-page__go">Open →</span>
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="h-faq">
        <div className="h-faq__head">
          <h2 className="chunk">{searching ? 'Answers' : 'Common questions'}</h2>
          {!searching && (
            <div className="h-topics" role="tablist">
              {topics.map((t) => (
                <button key={t} role="tab" aria-selected={t === topic} className={t === topic ? 'is-on' : ''} onClick={() => setTopic(t)}>
                  {t === topic && <motion.span layoutId="h-topic" className="h-topics__bg" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {answers.length === 0 ? (
          <div className="h-none">
            <Shape kind="circle" color="var(--blue)" glyph="grep" size={56} />
            <div>
              <b>Nothing matches “{query}”.</b>
              <p className="d-muted small">Try fewer words, or run the system check below. You can also <Link to="/app/ask">ask the codebase</Link> directly.</p>
            </div>
          </div>
        ) : (
          <div className="h-faq__list">
            {answers.map((f) => {
              const isOpen = open === f.q || searching
              return (
                <motion.div key={f.q} layout className={`h-q ${isOpen ? 'is-open' : ''}`} transition={{ layout: { duration: 0.3, ease: EASE } }}>
                  <button className="h-q__btn" onClick={() => setOpen(open === f.q ? null : f.q)} aria-expanded={isOpen}>
                    <span className="h-q__topic">{f.topic}</span>
                    <b>{f.q}</b>
                    <motion.span className="h-q__plus" animate={{ rotate: isOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }} aria-hidden>+</motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div className="h-q__a" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
                        <p>{f.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </div>
        )}
      </section>

      <div className="h-duo">
        <Keys />
        <SystemCheck />
      </div>
    </div>
  )
}
