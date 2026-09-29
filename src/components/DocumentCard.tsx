import { useI18n } from '../lib/i18n'
import { useCountryName } from '../lib/queries'
import { useSignedUrl } from '../lib/storage'
import type { DocumentRow, Profile } from '../lib/types'
import { cx } from './ui'

const COUNTRY_COLORS: Record<string, string> = {
  BOBO: 'from-brand-600 to-brand-900',
  SSHP: 'from-rose-600 to-rose-900',
  BOBOSTAN: 'from-emerald-600 to-emerald-900',
  PONOSSO: 'from-slate-600 to-slate-900',
  INDUSIA: 'from-amber-500 to-orange-800',
}

export function DocumentCard({ doc, holder, action }: { doc: DocumentRow; holder?: Profile; action?: React.ReactNode }) {
  const { t, date, lang } = useI18n()
  const countryName = useCountryName()
  const expired = doc.valid_until && new Date(doc.valid_until) < new Date()
  const invalid = Boolean(doc.revoked_at) || Boolean(expired)
  const d = doc.data ?? {}
  const vehicle = d.brand ? [d.brand, d.model, d.color].filter(Boolean).join(' · ') : undefined
  const extra = d.category ?? d.purpose ?? d.name ?? d.kind ?? d.address ?? vehicle ?? d.city
  const photo = useSignedUrl('photos', doc.photo_path)
  const name = [doc.data?.last_name, doc.data?.first_name, doc.data?.patronymic].filter(Boolean).join(' ') || holder?.display_name

  return (
    <div
      data-testid={`doc-${doc.type}`}
      className={cx(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-md',
        COUNTRY_COLORS[doc.country_code] ?? 'from-brand-600 to-brand-900',
        invalid && 'opacity-50 grayscale',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-white/70">{countryName(doc.country_code, lang === 'psy')}</div>
          <div className="text-xl font-black">{t(`docs.${doc.type}`)}</div>
        </div>
        <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 opacity-80" aria-hidden>
          <circle cx="20" cy="20" r="18" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="20" cy="20" r="11" fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 2" />
          <text x="20" y="25" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff">
            Б
          </text>
        </svg>
      </div>
      <div className="mt-4 flex items-start gap-4">
        {doc.photo_path && (
          <div className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded bg-white/20 ring-1 ring-white/40">
            {photo.data && <img src={photo.data} alt="" className="h-full w-full object-cover" />}
          </div>
        )}
        <div className="min-w-0">
          {name && <div className="text-lg font-bold">{name}</div>}
          <div className="mt-1 font-mono text-lg tracking-wider" data-testid="doc-number">
            {doc.number}
          </div>
          {extra && <div className="mt-1 text-sm text-white/80">{extra}</div>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/80">
        <span>
          {t('cabinet.issued')}: {date(doc.issued_at)}
        </span>
        <span>
          {t('cabinet.validUntil')}: {doc.valid_until ? date(doc.valid_until) : t('cabinet.forever')}
        </span>
      </div>
      {doc.revoked_at && (
        <div className="mt-3 inline-block rounded-md bg-black/30 px-2 py-1 text-xs font-bold">
          {t('cabinet.revoked')} {doc.revoke_reason ? `— ${doc.revoke_reason}` : ''}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
