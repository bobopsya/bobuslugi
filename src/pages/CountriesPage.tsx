import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Loading, PageTitle, Row } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountries, useProfiles } from '../lib/queries'
import { NotFoundPage } from './MiscPages'

export function CountriesPage() {
  const { t, lang } = useI18n()
  const { data, isLoading } = useCountries()
  if (isLoading) return <Loading />
  return (
    <>
      <PageTitle>{t('countries.title')}</PageTitle>
      <div className="grid gap-4 md:grid-cols-2">
        {(data ?? []).map((c) => (
          <Link key={c.code} to={`/countries/${c.code}`} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 hover:ring-brand-200">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xl font-black">{lang === 'psy' ? c.psy_name : c.name}</div>
              <Badge tone={c.in_union ? 'blue' : 'gray'}>{c.in_union ? t('countries.union') : t('countries.notUnion')}</Badge>
            </div>
            <div className="mt-1 text-sm text-muted">
              {t('countries.capital')}: {c.capital ?? t('countries.unknown')} · {c.leader_title}: {c.leader_name ?? '—'}
            </div>
            <p className="mt-3 line-clamp-3 text-sm">{c.description}</p>
          </Link>
        ))}
      </div>
    </>
  )
}

export function CountryPage() {
  const { code } = useParams()
  const { t, num, lang } = useI18n()
  const { session } = useAuth()
  const { data, isLoading } = useCountries()
  const profiles = useProfiles(Boolean(session))
  if (isLoading) return <Loading />
  const c = data?.find((x) => x.code === code)
  if (!c) return <NotFoundPage />
  const citizens = (profiles.data ?? []).filter((p) => p.country_code === c.code)
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/countries" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('countries.title')}
      </Link>
      <Card className="mt-3">
        <h1 className="text-3xl font-black">{lang === 'psy' ? c.psy_name : c.name}</h1>
        <p className="mt-3 leading-relaxed">{c.description}</p>
        <div className="mt-4">
          <Row label={t('countries.capital')}>{c.capital ?? t('countries.unknown')}</Row>
          <Row label={t('countries.leader')}>
            {c.leader_title}: {c.leader_name ?? '—'}
          </Row>
          {c.cities.length > 0 && <Row label={t('countries.cities')}>{c.cities.join(', ')}</Row>}
          <Row label={t('common.status')}>{c.in_union ? t('countries.union') : t('countries.notUnion')}</Row>
          <Row label={t('common.date')}>{t('countries.founded')}</Row>
          {session && <Row label={t('common.user')}>{t('countries.citizens', { count: num(citizens.length) })}</Row>}
        </div>
      </Card>
    </div>
  )
}
