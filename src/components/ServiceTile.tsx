import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { serviceDef } from '../lib/services'
import type { ServiceRow } from '../lib/types'

export function ServiceTile({ service }: { service: ServiceRow }) {
  const { t, coins } = useI18n()
  const def = serviceDef(service.code)
  return (
    <Link
      to={`/services/${service.code}`}
      className="group flex h-full flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-200"
    >
      <span className="mb-3 text-3xl" aria-hidden>
        {def?.icon ?? '📄'}
      </span>
      <span className="font-black text-ink group-hover:text-brand-700">{t(`services.${service.code}.title`)}</span>
      <span className="mt-1 flex-1 text-sm text-muted">{t(`services.${service.code}.desc`)}</span>
      <span className="mt-3 text-xs font-bold text-brand-700">
        {service.fee > 0 ? t('catalog.fee', { amount: coins(service.fee) }) : t('catalog.free')}
      </span>
    </Link>
  )
}
