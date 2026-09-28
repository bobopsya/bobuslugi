import { Link } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { useCountryName } from '../lib/queries'
import type { News } from '../lib/types'
import { Badge } from './ui'

export function NewsCard({ item }: { item: News }) {
  const { t, date, lang } = useI18n()
  const countryName = useCountryName()
  return (
    <Link to={`/news/${item.id}`} className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 hover:ring-brand-200">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone={item.kind === 'decree' ? 'red' : 'blue'}>{t(`newsKind.${item.kind}`)}</Badge>
        <span>{item.country_code ? countryName(item.country_code, lang === 'psy') : t('news.planetWide')}</span>
        <span>·</span>
        <span>{date(item.created_at)}</span>
      </div>
      <div className="font-black text-ink">{item.title}</div>
      <p className="mt-1 line-clamp-2 text-sm text-muted">{item.body}</p>
    </Link>
  )
}
