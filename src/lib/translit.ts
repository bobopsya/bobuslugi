// Транслитерация и машиночитаемая зона (MRZ) для паспортов Асея.
import type { DocumentRow } from './types'

const MAP: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'I', к: 'K', л: 'L', м: 'M',
  н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'KH', ц: 'TS', ч: 'CH', ш: 'SH', щ: 'SHCH',
  ъ: 'IE', ы: 'Y', ь: '', э: 'E', ю: 'IU', я: 'IA',
}

export function translit(s: string): string {
  return [...s.toLowerCase()]
    .map((ch) => MAP[ch] ?? (/[a-z]/.test(ch) ? ch.toUpperCase() : /[0-9]/.test(ch) ? ch : '<'))
    .join('')
    .replace(/<+/g, '<')
}

const COUNTRY_CODES: Record<string, string> = { BOBO: 'BOB', SSHP: 'SSP', BOBOSTAN: 'BST', PONOSSO: 'PNS', INDUSIA: 'IND' }

function pad(s: string, len: number) {
  return (s + '<'.repeat(len)).slice(0, len)
}

/** Две строки MRZ по мотивам настоящего паспорта (без контрольных цифр — на Асее они не нужны). */
export function mrz(doc: DocumentRow): [string, string] {
  const d = doc.data ?? {}
  const cc = COUNTRY_CODES[doc.country_code] ?? 'ASE'
  const kind = doc.type === 'intl_passport' ? 'P<' : 'PN'
  const names = [d.first_name, d.patronymic].filter(Boolean).map((x) => translit(String(x))).join('<')
  const line1 = pad(`${kind}${cc}${translit(String(d.last_name ?? ''))}<<${names}`, 44)
  const digits = doc.number.replace(/\s/g, '')
  const birth = String(d.birth_date ?? '').replace(/-/g, '').slice(2) || '<<<<<<'
  const sex = d.sex === 'Ж' ? 'F' : d.sex === 'М' ? 'M' : '<'
  const line2 = pad(`${pad(digits, 12)}${cc}${pad(birth, 6)}${sex}${pad('', 6)}`, 44)
  return [line1, line2]
}

/** Серия и номер паспорта: первые две группы — серия, остальное — номер. */
export function seriesAndNumber(number: string): { series: string; num: string } {
  const parts = number.split(' ')
  return { series: parts.slice(0, 2).join(' '), num: parts.slice(2).join(' ') }
}

/** Имя файла латиницей: не все браузеры сохраняют файлы с кириллицей в имени. */
export function latinFileName(name: string): string {
  const out = [...name]
    .map((ch) => {
      const low = ch.toLowerCase()
      const m = MAP[low]
      if (m === undefined) return /[\w.\-]/.test(ch) ? ch : '_'
      const lat = m.toLowerCase()
      return ch !== low && lat ? lat[0].toUpperCase() + lat.slice(1) : lat
    })
    .join('')
  return out.replace(/_+/g, '_')
}
