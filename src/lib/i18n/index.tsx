import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { formatDate, formatNumber, toLoreNumber, type Lang } from '../lore'
import { psy } from './psy'
import { ru } from './ru'

const STORAGE_KEY = 'bobuslugi.lang'

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), dict)
}

function interpolate(s: string, params?: Record<string, string | number>): string {
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`))
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return many
  if (b === 1) return one
  if (b >= 2 && b <= 4) return few
  return many
}

type I18n = {
  lang: Lang
  setLang: (l: Lang) => void
  /** Строка словаря по ключу вида `nav.home`. */
  t: (key: string, params?: Record<string, string | number>) => string
  /** Сырое значение словаря (массивы, объекты). */
  raw: <T>(key: string) => T
  num: (n: number) => string
  date: (d: string | Date | null | undefined, withTime?: boolean) => string
  coins: (n: number) => string
}

const I18nContext = createContext<I18n | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'psy' ? 'psy' : 'ru'
  } catch {
    return 'ru'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      // без localStorage язык просто не запомнится
    }
    document.documentElement.lang = l === 'psy' ? 'ru-x-psy' : 'ru'
  }, [])

  const value = useMemo<I18n>(() => {
    const raw = <T,>(key: string): T => {
      const v = lang === 'psy' ? lookup(psy, key) : undefined
      return (v ?? lookup(ru, key)) as T
    }
    const t = (key: string, params?: Record<string, string | number>) => {
      const v = raw<unknown>(key)
      return typeof v === 'string' ? interpolate(v, params) : key
    }
    const num = (n: number) => formatNumber(n, lang)
    const coins = (n: number) => {
      const shown = lang === 'psy' ? toLoreNumber(n) : n
      return `${num(n)} ${pluralRu(shown, t('coins.one'), t('coins.few'), t('coins.many'))}`
    }
    return { lang, setLang, t, raw, num, coins, date: (d, withTime) => formatDate(d, lang, withTime) }
  }, [lang, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
