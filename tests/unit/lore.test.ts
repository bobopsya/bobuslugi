import { describe, expect, it } from 'vitest'
import { formatDate, formatNumber, LORE_NUMBERS, psyAdd, toLoreNumber } from '../../src/lib/lore'

describe('toLoreNumber', () => {
  it('лорные числа остаются собой', () => {
    for (const n of LORE_NUMBERS) expect(toLoreNumber(n)).toBe(n)
  })

  it('любое число становится лорным и детерминированно', () => {
    for (const n of [0, 1, 5, 52, 67, 1000, 99999, -7]) {
      const r = toLoreNumber(n)
      expect(LORE_NUMBERS).toContain(Math.abs(r))
      expect(toLoreNumber(n)).toBe(r)
    }
  })

  it('знак сохраняется', () => {
    expect(toLoreNumber(-123)).toBe(-123)
  })
})

describe('formatNumber', () => {
  it('на русском — обычное число', () => {
    expect(formatNumber(1500, 'ru').replace(/\s/g, ' ')).toBe('1 500')
  })
  it('на псянском — лорное', () => {
    expect(LORE_NUMBERS.map(String)).toContain(formatNumber(1500, 'psy'))
  })
})

describe('formatDate', () => {
  it('на псянском дата всегда 12.34.1234', () => {
    expect(formatDate('2026-09-28T10:00:00Z', 'psy')).toBe('12.34.1234')
    expect(formatDate(new Date(), 'psy', true)).toBe('12.34.1234 12:34')
  })
  it('на русском — настоящая дата', () => {
    expect(formatDate('2026-09-28T10:00:00Z', 'ru')).toBe('28.09.2026')
  })
  it('пустое значение', () => {
    expect(formatDate(null, 'ru')).toBe('—')
  })
})

describe('psyAdd', () => {
  it('ответ всегда лорный', () => {
    expect(LORE_NUMBERS).toContain(psyAdd(123, 123))
    expect(LORE_NUMBERS).toContain(psyAdd(1234, 123))
  })
})
