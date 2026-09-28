import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, unwrap } from './api'
import { isConfigured, loginToEmail, supabase } from './supabase'
import type { Profile } from './types'

type Auth = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (login: string, password: string) => Promise<void>
  signUp: (p: { login: string; password: string; displayName: string; invite?: string }) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(isConfigured)
  const qc = useQueryClient()

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      qc.invalidateQueries()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  const uid = session?.user.id
  const profileQuery = useQuery({
    queryKey: ['profile', uid],
    enabled: Boolean(uid),
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').eq('id', uid!).single()) as Profile,
  })

  const value: Auth = {
    session,
    profile: uid ? (profileQuery.data ?? null) : null,
    loading: sessionLoading || (Boolean(uid) && profileQuery.isLoading),
    async signIn(login, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: loginToEmail(login), password })
      if (error) throw new ApiError('E_LOGIN_FAILED', error.message)
    },
    async signUp({ login, password, displayName, invite }) {
      const { data: check, error: checkError } = await supabase.rpc('check_signup', {
        p_login: login,
        p_display_name: displayName,
        p_invite: invite ?? null,
      })
      if (checkError) throw new ApiError('UNKNOWN', checkError.message)
      if (check) throw new ApiError(check as string)
      const { data, error } = await supabase.auth.signUp({
        email: loginToEmail(login),
        password,
        options: { data: { login, display_name: displayName.trim(), invite_code: invite ?? null } },
      })
      if (error) throw new ApiError('UNKNOWN', error.message)
      if (!data.session) throw new ApiError('E_CONFIRM_EMAIL')
    },
    async signOut() {
      await supabase.auth.signOut()
      qc.clear()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}

export function isStaff(p: Profile | null): boolean {
  return Boolean(p && p.role !== 'citizen' && !p.banned)
}
