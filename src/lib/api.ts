import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { supabase } from './supabase'

/** Ошибка с кодом из базы (E_...). */
export class ApiError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message ?? code)
    this.code = code
  }
}

function codeFrom(message: string): string {
  const m = message.match(/\bE_[A-Z_]+\b/)
  return m ? m[0] : 'UNKNOWN'
}

/** Вызов функции базы. Ответ `{ ok: false, error }` тоже превращается в ошибку. */
export async function callRpc<T = { ok: true; id?: number }>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new ApiError(codeFrom(error.message), error.message)
  if (data && typeof data === 'object' && !Array.isArray(data) && (data as { ok?: boolean }).ok === false) {
    const code = (data as { error?: string }).error ?? 'UNKNOWN'
    throw new ApiError(code)
  }
  return data as T
}

/** Бросает ошибку запроса к таблице. */
export function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new ApiError(codeFrom(res.error.message), res.error.message)
  return res.data as T
}

export function errorText(err: unknown, t: (k: string, p?: Record<string, string | number>) => string): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`
    const text = t(key)
    return text === key ? t('errors.UNKNOWN', { message: err.message }) : text
  }
  if (err instanceof Error) return t('errors.UNKNOWN', { message: err.message })
  return t('common.error')
}

/**
 * Действие, которое меняет данные. После него перечитываются все запросы:
 * так автоштраф за запрещённое слово сразу виден в кабинете.
 */
export function useAction<A = void, R = unknown>(fn: (args: A) => Promise<R>, onSuccess?: (result: R, args: A) => void) {
  const qc = useQueryClient()
  const [done, setDone] = useState(false)
  const m = useMutation({
    mutationFn: fn,
    onMutate: () => setDone(false),
    onSuccess: (r, a) => {
      setDone(true)
      onSuccess?.(r, a)
    },
    onSettled: () => qc.invalidateQueries(),
  })
  return { run: m.mutate, runAsync: m.mutateAsync, pending: m.isPending, error: m.error, done, reset: () => { m.reset(); setDone(false) } }
}
