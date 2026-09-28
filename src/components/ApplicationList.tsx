import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useCountryName, useProfileMap } from '../lib/queries'
import { serviceDef } from '../lib/services'
import type { Application } from '../lib/types'
import { AppStatusBadge } from './badges'

export function ApplicationList({ items, base, showApplicant }: { items: Application[]; base: string; showApplicant?: boolean }) {
  const { t, date, lang } = useI18n()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
      {items.map((a) => (
        <Link key={a.id} to={`${base}/${a.id}`} className="flex items-center gap-4 p-4 hover:bg-brand-50/50" data-testid="application-row">
          <span className="text-2xl" aria-hidden>
            {serviceDef(a.service_code)?.icon ?? '📄'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{t(`services.${a.service_code}.title`)}</span>
            <span className="block truncate text-sm text-muted">
              {t('common.number')}
              {a.id} · {countryName(a.target_country, lang === 'psy')} · {date(a.created_at)}
              {showApplicant && ` · ${profileOf(a.user_id)?.display_name ?? '…'}`}
            </span>
          </span>
          <AppStatusBadge status={a.status} />
        </Link>
      ))}
    </div>
  )
}
