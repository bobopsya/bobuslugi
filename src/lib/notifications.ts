import type { Notification } from './types'

type T = (k: string, p?: Record<string, string | number>) => string

/** Текст уведомления на текущем языке. В базе хранится только вид и параметры. */
export function notificationText(n: Notification, t: T, coins: (n: number) => string, num: (n: number) => string): string {
  const p = n.params ?? {}
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(p)) if (v != null) params[k] = typeof v === 'boolean' ? String(v) : v
  if (typeof p.service === 'string') params.service = t(`services.${p.service}.title`)
  if (typeof p.status === 'string') params.status = t(`appStatus.${p.status}`)
  if (typeof p.amount === 'number') params.amount = coins(p.amount)
  if (typeof p.type === 'string') params.type = t(`docs.${p.type}`)
  if (typeof p.role === 'string') params.role = t(`roles.${p.role}`)
  if (typeof p.id === 'number') params.id = num(p.id)
  return t(`notif.${n.kind}`, params)
}
