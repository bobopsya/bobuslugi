import { Badge, Card, Empty, Loading, PageTitle, SectionTitle } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountryName, useDebtors, useWanted } from '../lib/queries'

export function WantedPage() {
  const { t, coins, lang, date } = useI18n()
  const { session } = useAuth()
  const wanted = useWanted()
  const debtors = useDebtors()
  const countryName = useCountryName()
  const active = (wanted.data ?? []).filter((w) => w.active)

  return (
    <>
      <PageTitle sub={t('wanted.subtitle')}>{t('wanted.title')}</PageTitle>
      {wanted.isLoading ? (
        <Loading />
      ) : active.length ? (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((w) => (
            <div key={w.id} className="overflow-hidden rounded-2xl bg-amber-50 ring-2 ring-amber-300">
              <div className="bg-amber-400 px-4 py-2 text-center text-sm font-black uppercase tracking-[0.3em] text-amber-950">WANTED</div>
              <div className="p-5">
                <div className="mb-3 grid h-24 place-items-center rounded-xl bg-amber-100 text-5xl" aria-hidden>
                  🕵️
                </div>
                <div className="text-lg font-black">{w.name}</div>
                {w.description && <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{w.description}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {w.reward > 0 && <Badge tone="green">{t('wanted.reward', { amount: coins(w.reward) })}</Badge>}
                  <span className="text-amber-800">
                    {w.country_code ? countryName(w.country_code, lang === 'psy') : t('common.planet')} · {date(w.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-10">
          <Empty>{t('wanted.empty')}</Empty>
        </div>
      )}

      <SectionTitle>{t('wanted.debtors')}</SectionTitle>
      {!session ? (
        <Empty>{t('wanted.loginForDebtors')}</Empty>
      ) : debtors.isLoading ? (
        <Loading />
      ) : debtors.data?.length ? (
        <Card className="p-0 sm:p-0">
          <div className="divide-y divide-slate-100">
            {debtors.data.map((d) => (
              <div key={d.user_id} className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{d.display_name}</span>
                  <span className="block text-sm text-muted">
                    @{d.login} · {d.country_code ? countryName(d.country_code, lang === 'psy') : t('common.noCountry')}
                  </span>
                </span>
                <Badge tone="red">{t('wanted.debt', { amount: coins(Number(d.total)) })}</Badge>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Empty>{t('wanted.noDebtors')}</Empty>
      )}
    </>
  )
}
