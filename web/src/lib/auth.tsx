import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { authBypass, supabase } from './supabase'

type Provider = 'github' | 'google'

type AuthState = {
  ready: boolean
  session: Session | null
  user: User | null
  displayName: string
  avatar: string
  bypass: boolean
  signInWith: (provider: Provider) => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ needsConfirmation: boolean }>
  sendMagicLink: (email: string) => Promise<void>
  signInWithPasskey: () => Promise<void>
  registerPasskey: () => Promise<void>
  connectGitHub: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function need() {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to web/.env.')
  return supabase
}

const redirectTo = () => `${window.location.origin}/auth/callback`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const value = useMemo<AuthState>(() => {
    const user = session?.user ?? null
    const meta = (user?.user_metadata ?? {}) as Record<string, string>
    return {
      ready,
      session,
      user,
      bypass: authBypass && !supabase,
      displayName: meta.full_name || meta.name || meta.user_name || user?.email?.split('@')[0] || (authBypass ? 'Local developer' : ''),
      avatar: meta.avatar_url || '',
      async signInWith(provider) {
        const { error } = await need().auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirectTo(), scopes: provider === 'github' ? 'read:user public_repo' : undefined },
        })
        if (error) throw error
      },
      async signInWithEmail(email, password) {
        const { error } = await need().auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUpWithEmail(email, password, name) {
        const { data, error } = await need().auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: redirectTo() } })
        if (error) throw error
        return { needsConfirmation: !data.session }
      },
      async sendMagicLink(email) {
        const { error } = await need().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } })
        if (error) throw error
      },
      async signInWithPasskey() {
        // Needs passkey sign-in enabled for the project (see docs/supabase.md).
        if (!window.PublicKeyCredential) throw new Error('This browser does not support passkeys.')
        const { error } = await need().auth.signInWithPasskey()
        if (error) throw error
      },
      async registerPasskey() {
        if (!window.PublicKeyCredential) throw new Error('This browser does not support passkeys.')
        const { error } = await need().auth.registerPasskey()
        if (error) throw error
      },
      async connectGitHub() {
        // Links GitHub to the signed-in account (manual identity linking must be enabled in Supabase).
        const { error } = await need().auth.linkIdentity({ provider: 'github', options: { redirectTo: redirectTo() + '?next=/app/repos', scopes: 'read:user public_repo' } })
        if (error) throw error
      },
      async signOut() {
        if (supabase) await supabase.auth.signOut()
      },
    }
  }, [ready, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

/** Signed in, or running in the explicit local bypass. */
export function useSignedIn(): boolean {
  const { session, bypass } = useAuth()
  return Boolean(session) || bypass
}
