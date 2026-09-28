// Правила планеты Асей: числа, даты и псянский словарь.

export type Lang = 'ru' | 'psy'

/** На Асее существуют только эти числа. */
export const LORE_NUMBERS = [123, 321, 1234, 4321] as const

/** На Асее всегда одна и та же дата. */
export const LORE_DATE = '12.34.1234'
export const LORE_TIME = '12:34'

/**
 * Превращает любое число в одно из лорных. Одно и то же число всегда даёт один и тот же результат,
 * а лорные числа остаются собой.
 */
export function toLoreNumber(n: number): number {
  const abs = Math.abs(Math.trunc(n))
  const lore = (LORE_NUMBERS as readonly number[]).includes(abs) ? abs : LORE_NUMBERS[abs % LORE_NUMBERS.length]
  return n < 0 ? -lore : lore
}

export function formatNumber(n: number, lang: Lang): string {
  if (lang === 'psy') return String(toLoreNumber(n))
  return n.toLocaleString('ru-RU')
}

export function formatDate(value: string | Date | null | undefined, lang: Lang, withTime = false): string {
  if (!value) return '—'
  if (lang === 'psy') return withTime ? `${LORE_DATE} ${LORE_TIME}` : LORE_DATE
  const d = typeof value === 'string' ? new Date(value) : value
  return withTime
    ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU')
}

/** Псянско-русский словарь из лора. */
export const DICTIONARY: { psy: string; ru: string }[] = [
  { psy: 'асей / осей', ru: 'окей' },
  { psy: 'ас / ос / ус / усей', ru: 'ок' },
  { psy: 'га', ru: 'давай / го / пошли' },
  { psy: 'кси', ru: 'привет' },
  { psy: 'паса', ru: 'пока' },
  { psy: 'досвидоним', ru: 'до свидания' },
  { psy: 'сапс', ru: 'спасибо' },
  { psy: 'пеж', ru: 'пожалуйста' },
  { psy: 'смука', ru: 'сумка' },
  { psy: 'сас дела', ru: 'как дела' },
  { psy: 'сас', ru: 'как' },
  { psy: 'чи / ил', ru: 'или' },
  { psy: 'сиф', ru: 'круто / хорошо / отлично / классно' },
  { psy: 'ГТА сас андрпас', ru: 'GTA San Andreas' },
  { psy: 'Гармод', ru: "Garry's Mod" },
]

/** Прибавляет лорные числа по законам псярефметики: ответ — тоже лорное число. */
export function psyAdd(a: number, b: number): number {
  return toLoreNumber(a + b)
}
