import { Link, useParams } from 'react-router-dom'
import { Badge, Card, Loading, PageTitle, Row } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountries, useCountryStats, useProfiles } from '../lib/queries'
import { NotFoundPage } from './MiscPages'

export function CountriesPage() {
  const { t, lang, num, coins } = useI18n()
  const { data, isLoading } = useCountries()
  const stats = useCountryStats()
  if (isLoading) return <Loading />
  const statOf = (code: string) => stats.data?.find((s) => s.code === code)
  const ranked = [...(data ?? [])].sort((a, b) => Number(statOf(b.code)?.population ?? 0) - Number(statOf(a.code)?.population ?? 0))
  return (
    <>
      <PageTitle>{t('countries.title')}</PageTitle>
      <div className="mb-6 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-black">{t('economy.ranking')}</div>
        {ranked.map((c, i) => (
          <div key={c.code} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0" data-testid="ranking-row">
            <span className="w-6 text-center font-black text-muted">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-bold">{lang === 'psy' ? c.psy_name : c.name}</span>
            <span className="text-right">
              <span className="block font-black text-brand-700">{num(Number(statOf(c.code)?.population ?? 0))}</span>
              <span className="block text-xs text-muted">{t('economy.treasuryShort', { amount: coins(Number(statOf(c.code)?.treasury ?? 0)) })}</span>
            </span>
          </div>
        ))}
      </div>
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
  const { t, num, lang, coins } = useI18n()
  const { session } = useAuth()
  const { data, isLoading } = useCountries()
  const stats = useCountryStats()
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
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-brand-700">{t('economy.population')}</div>
            <div className="text-2xl font-black" data-testid="country-population">
              {num(Number(stats.data?.find((s) => s.code === c.code)?.population ?? 0))}
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">{t('economy.treasury')}</div>
            <div className="text-2xl font-black">{coins(Number(stats.data?.find((s) => s.code === c.code)?.treasury ?? 0))}</div>
          </div>
        </div>
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
