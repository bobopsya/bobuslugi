import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

// Значения по умолчанию — стандартные ключи локального Supabase CLI.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  try {
    const res = await client.query(text, params)
    return res.rows as T[]
  } finally {
    await client.end()
  }
}

export async function resetDb() {
  await sql('truncate auth.users cascade')
  await sql(`truncate public.news, public.elections, public.wanted, public.audit_log restart identity cascade`)
  await sql(`update public.app_settings set value = '' where key = 'invite_code'`)
  await sql(`update public.app_settings set value = '123' where key = 'forbidden_fine'`)
}

export function anon(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type User = { client: SupabaseClient; id: string; login: string }

export async function signUp(login: string, displayName = login, invite?: string): Promise<User> {
  const client = anon()
  const { data, error } = await client.auth.signUp({
    email: `${login.toLowerCase()}@bobuslugi.local`,
    password: 'password1234',
    options: { data: { login, display_name: displayName, invite_code: invite } },
  })
  if (error) throw error
  return { client, id: data.user!.id, login }
}

/** Вызывает RPC и бросает ошибку с кодом из базы (E_...). */
export async function rpc<T = { ok: boolean; id?: number; error?: string }>(
  u: User,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await u.client.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function balance(u: User): Promise<number> {
  const rows = await sql<{ balance: number }>('select balance from profiles where id = $1', [u.id])
  return rows[0].balance
}
