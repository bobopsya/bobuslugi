import { useQuery } from '@tanstack/react-query'
import { unwrap } from './api'
import { useAuth } from './auth'
import { supabase } from './supabase'
import type {
  Application,
  Candidate,
  Country,
  Debtor,
  DocumentRow,
  Election,
  Fine,
  News,
  Notification,
  Profile,
  ServiceRow,
  Transaction,
  Wanted,
} from './types'

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    staleTime: Infinity,
    queryFn: async () => unwrap(await supabase.from('countries').select('*').order('sort')) as Country[],
  })
}

/** Название страны по коду в текущем языке. */
export function useCountryName() {
  const { data } = useCountries()
  return (code: string | null | undefined, psy = false) => {
    if (!code) return '—'
    const c = data?.find((x) => x.code === code)
    return c ? (psy ? c.psy_name : c.name) : code
  }
}

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async () => unwrap(await supabase.from('services').select('*').order('sort')) as ServiceRow[],
  })
}

/** Все профили (их немного — компания друзей). */
export function useProfiles(enabled = true) {
  return useQuery({
    queryKey: ['profiles'],
    enabled,
    queryFn: async () => unwrap(await supabase.from('profiles').select('*').order('login')) as Profile[],
  })
}

export function useProfileMap() {
  const { session } = useAuth()
  const { data } = useProfiles(Boolean(session))
  const map = new Map((data ?? []).map((p) => [p.id, p]))
  return (id: string | null | undefined) => (id ? map.get(id) : undefined)
}

export function useMyDocuments() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['documents', 'mine', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () =>
      unwrap(await supabase.from('documents').select('*').eq('user_id', profile!.id).order('issued_at', { ascending: false })) as DocumentRow[],
  })
}

export function useUserDocuments(userId: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'user', userId],
    enabled: Boolean(userId),
    queryFn: async () =>
      unwrap(await supabase.from('documents').select('*').eq('user_id', userId!).order('issued_at', { ascending: false })) as DocumentRow[],
  })
}

export function useMyApplications() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['applications', 'mine', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () =>
      unwrap(await supabase.from('applications').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false })) as Application[],
  })
}

export function useApplication(id: number) {
  return useQuery({
    queryKey: ['applications', 'one', id],
    queryFn: async () => unwrap(await supabase.from('applications').select('*').eq('id', id).maybeSingle()) as Application | null,
  })
}

/** Заявления, которые видит госслужащий (RLS сам отфильтрует по стране). */
export function useStaffApplications(onlyOpen: boolean) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['applications', 'staff', profile?.id, onlyOpen],
    enabled: Boolean(profile),
    queryFn: async () => {
      let q = supabase.from('applications').select('*').neq('user_id', profile!.id).order('created_at', { ascending: true })
      if (onlyOpen) q = q.eq('status', 'submitted')
      return unwrap(await q) as Application[]
    },
  })
}

export function useMyFines() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['fines', 'mine', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () =>
      unwrap(await supabase.from('fines').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false })) as Fine[],
  })
}

export function useStaffFines() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['fines', 'staff', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => unwrap(await supabase.from('fines').select('*').order('created_at', { ascending: false }).limit(300)) as Fine[],
  })
}

export function useMyTransactions() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['transactions', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () =>
      unwrap(await supabase.from('transactions').select('*').eq('user_id', profile!.id).order('id', { ascending: false })) as Transaction[],
  })
}

export function useNotifications() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['notifications', profile?.id],
    enabled: Boolean(profile),
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap(await supabase.from('notifications').select('*').eq('user_id', profile!.id).order('id', { ascending: false }).limit(100)) as Notification[],
  })
}

export function useNews(limit = 50) {
  return useQuery({
    queryKey: ['news', limit],
    queryFn: async () => unwrap(await supabase.from('news').select('*').order('id', { ascending: false }).limit(limit)) as News[],
  })
}

export function useNewsItem(id: number) {
  return useQuery({
    queryKey: ['news', 'one', id],
    queryFn: async () => unwrap(await supabase.from('news').select('*').eq('id', id).maybeSingle()) as News | null,
  })
}

export function useElections() {
  return useQuery({
    queryKey: ['elections'],
    queryFn: async () => unwrap(await supabase.from('elections').select('*').order('id', { ascending: false })) as Election[],
  })
}

export function useElection(id: number) {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['elections', 'one', id, profile?.id],
    queryFn: async () => {
      const election = unwrap(await supabase.from('elections').select('*').eq('id', id).maybeSingle()) as Election | null
      const candidates = unwrap(await supabase.from('candidates').select('*').eq('election_id', id).order('id')) as Candidate[]
      let myVote: number | null = null
      if (profile) {
        const v = unwrap(await supabase.from('votes').select('candidate_id').eq('election_id', id).maybeSingle()) as { candidate_id: number } | null
        myVote = v?.candidate_id ?? null
      }
      let results: { candidate_id: number; votes: number }[] | null = null
      if (election && profile) {
        const r = await supabase.rpc('election_results', { p_id: id })
        if (!r.error) results = r.data as { candidate_id: number; votes: number }[]
      }
      const turnout = profile ? ((await supabase.rpc('election_turnout', { p_id: id })).data as number | null) : null
      return { election, candidates, myVote, results, turnout }
    },
  })
}

export function useWanted() {
  return useQuery({
    queryKey: ['wanted'],
    queryFn: async () => unwrap(await supabase.from('wanted').select('*').order('id', { ascending: false })) as Wanted[],
  })
}

export function useDebtors() {
  const { profile } = useAuth()
  return useQuery({
    queryKey: ['debtors', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => unwrap(await supabase.rpc('debtors')) as Debtor[],
  })
}
