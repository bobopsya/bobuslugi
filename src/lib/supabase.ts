import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Если переменные не заданы, клиент создаётся с заглушкой, а приложение показывает экран настройки.
export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key')

const EMAIL_DOMAIN = (import.meta.env.VITE_EMAIL_DOMAIN as string | undefined) || 'bobuslugi.local'

/** Supabase Auth работает с email, поэтому логин превращается в служебный адрес. */
export function loginToEmail(login: string): string {
  return `${login.trim().toLowerCase()}@${EMAIL_DOMAIN}`
}
