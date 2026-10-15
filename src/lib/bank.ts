import { supabase } from './supabase'

/** Bobobank and GPAY on the same server. Empty means the integration is off and the bank sections are hidden. */
export const BANK_URL = ((import.meta.env.VITE_BANK_URL as string | undefined) ?? '').replace(/\/$/, '')
export const GPAY_URL = ((import.meta.env.VITE_GPAY_URL as string | undefined) ?? '').replace(/\/$/, '')
export const bankEnabled = Boolean(BANK_URL)

/** Where each client sends people back after «Войти через Бобуслуги» (never taken from the link itself). */
export const CLIENTS: Record<string, { name: string; url: string; scope: string[] }> = {
  bank: { name: 'Bobobank', url: BANK_URL, scope: ['ФИО и дату рождения из Бобопаспорта', 'номер и страну паспорта', 'ваши ИП и компании с ИНН', 'баланс псякоинов (для обмена)'] },
  gpay: { name: 'GPAY', url: GPAY_URL, scope: ['имя', 'ваши ИП и компании с ИНН — для реквизитов магазина'] },
}

export class BankError extends Error {}

/** Calls the bank on behalf of the signed-in citizen (Supabase token, CORS). */
export async function bankApi<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new BankError('Войдите на Бобуслуги')
  const res = await fetch(`${BANK_URL}/api/gos/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new BankError(body.error ?? 'Банк не ответил')
  return body as T
}

export const rub = (minor: number) =>
  `${(minor / 100).toLocaleString('ru-RU', { minimumFractionDigits: minor % 100 ? 2 : 0, maximumFractionDigits: 2 })} ₽`

export interface BankSummary {
  linked: boolean
  bankUrl: string
  client?: { name: string; phone: string; since: number }
  accounts?: { id: string; name: string; number: string; kind: string; currency: string; balance: number }[]
}

export interface BankStatement {
  account: { name: string; number: string; currency: string }
  holder: string
  from: number
  to: number
  opening: number
  closing: number
  income: number
  spent: number
  entries: { date: number; title: string; subtitle: string; amount: number }[]
}

export interface BankIncome {
  holder: string
  months: { month: string; amount: number }[]
  total: number
}
