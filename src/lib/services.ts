import type { DocumentRow, Profile, TargetMode } from './types'

export type FieldKind = 'text' | 'textarea' | 'select' | 'city' | 'country'

export type FieldDef = {
  name: string
  kind: FieldKind
  required?: boolean
  /** Ключ словаря с вариантами для select (options.<name>). */
  optionsKey?: string
  /** Ключ словаря с подписью (fields.<label>). По умолчанию совпадает с name. */
  label?: string
}

export type ServiceDef = {
  code: string
  icon: string
  fields: FieldDef[]
  /** Проверка на стороне клиента, чтобы заранее показать причину недоступности. Сервер проверяет сам. */
  check?: (p: Profile, docs: DocumentRow[], target?: string | null) => string | null
}

const active = (docs: DocumentRow[], type: DocumentRow['type'], country?: string | null) =>
  docs.some(
    (d) =>
      d.type === type &&
      !d.revoked_at &&
      (!d.valid_until || new Date(d.valid_until) > new Date()) &&
      (country == null || d.country_code === country),
  )

const citizen = (p: Profile) => (p.country_code ? null : 'E_NOT_CITIZEN')
const passport = (p: Profile, docs: DocumentRow[]) =>
  citizen(p) ?? (active(docs, 'passport', p.country_code) ? null : 'E_NEED_PASSPORT')

export const SERVICE_DEFS: ServiceDef[] = [
  {
    code: 'citizenship',
    icon: '🪪',
    fields: [
      { name: 'city', kind: 'city', required: true },
      { name: 'reason', kind: 'textarea', required: true },
    ],
    check: (p) => (p.country_code ? 'E_ALREADY_CITIZEN' : null),
  },
  {
    code: 'change_citizenship',
    icon: '🧳',
    fields: [
      { name: 'city', kind: 'city', required: true },
      { name: 'reason', kind: 'textarea', required: true },
    ],
    check: citizen,
  },
  {
    code: 'residence_permit',
    icon: '🏠',
    fields: [
      { name: 'city', kind: 'city', required: true },
      { name: 'reason', kind: 'textarea', required: true },
    ],
  },
  {
    code: 'passport_reissue',
    icon: '♻️',
    fields: [{ name: 'reason', kind: 'select', optionsKey: 'reissue_reason', label: 'reissue_reason', required: true }],
    check: citizen,
  },
  {
    code: 'intl_passport',
    icon: '🌍',
    fields: [],
    check: (p, docs) => passport(p, docs) ?? (active(docs, 'intl_passport', p.country_code) ? 'E_ALREADY_HAS' : null),
  },
  {
    code: 'driver_license',
    icon: '🚗',
    fields: [{ name: 'category', kind: 'select', optionsKey: 'category', required: true }],
    check: (p, docs) => passport(p, docs) ?? (active(docs, 'driver_license', p.country_code) ? 'E_ALREADY_HAS' : null),
  },
  {
    code: 'psyals',
    icon: '🧾',
    fields: [],
    check: (p, docs) => passport(p, docs) ?? (active(docs, 'psyals', p.country_code) ? 'E_ALREADY_HAS' : null),
  },
  {
    code: 'visa',
    icon: '✈️',
    fields: [{ name: 'purpose', kind: 'select', optionsKey: 'purpose', required: true }],
    check: (p, docs, target) =>
      citizen(p) ??
      (active(docs, 'intl_passport', p.country_code) ? null : 'E_NEED_INTL_PASSPORT') ??
      (target && active(docs, 'visa', target) ? 'E_ALREADY_HAS' : null),
  },
  {
    code: 'samenka_delivery',
    icon: '🚢',
    fields: [
      { name: 'from', kind: 'country', required: true },
      { name: 'cargo', kind: 'textarea', required: true },
    ],
    check: citizen,
  },
  {
    code: 'migrant_window',
    icon: '🌀',
    fields: [{ name: 'reason', kind: 'textarea', required: true }],
    check: (p, docs) => (p.country_code === 'BOBOSTAN' || active(docs, 'visa', 'BOBOSTAN') ? null : 'E_NEED_VISA'),
  },
  {
    code: 'letter_president',
    icon: '✉️',
    fields: [
      { name: 'subject', kind: 'text', required: true },
      { name: 'text', kind: 'textarea', required: true },
    ],
    check: citizen,
  },
  {
    code: 'gang_complaint',
    icon: '🚨',
    fields: [
      { name: 'gang', kind: 'select', optionsKey: 'gang', required: true },
      { name: 'place', kind: 'text', required: true },
      { name: 'text', kind: 'textarea', required: true },
    ],
    check: citizen,
  },
]

export const CATEGORY_ORDER = ['citizenship', 'documents', 'travel', 'appeals'] as const

export const CATEGORY_ICONS: Record<string, string> = {
  citizenship: '🏛️',
  documents: '📄',
  travel: '🧭',
  appeals: '📣',
}

export function serviceDef(code: string): ServiceDef | undefined {
  return SERVICE_DEFS.find((s) => s.code === code)
}

/** Где рассматривается заявление с учётом режима услуги. */
export function resolveTarget(mode: TargetMode, fixed: string | null, p: Profile | null, chosen: string | null): string | null {
  if (mode === 'own') return p?.country_code ?? null
  if (mode === 'fixed') return fixed
  return chosen
}
