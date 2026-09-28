import { useI18n } from '../i18n'
import { useCountryName, useProfileMap } from '../queries'
import type { PdfCtx } from './templates'

/** Контекст для шаблонов PDF: словарь, форматирование, названия стран и профили. */
export function usePdfCtx(): PdfCtx {
  const { t, date, coins, num, lang } = useI18n()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  return { t, date, coins, num, countryName: (c) => countryName(c, lang === 'psy'), profileOf }
}

export const pdf = () => import('./templates')
