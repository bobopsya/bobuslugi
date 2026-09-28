import { Link } from 'react-router-dom'
import { NewsCard } from '../components/NewsCard'
import { ServiceTile } from '../components/ServiceTile'
import { Alert, ButtonLink, Card, Empty, Loading, SectionTitle } from '../components/ui'
import { isStaff, useAuth } from '../lib/auth'
import { LORE_DATE } from '../lib/lore'
import { useI18n } from '../lib/i18n'
import { useMyApplications, useMyDocuments, useMyFines, useNews, useServices, useStaffApplications } from '../lib/queries'

const POPULAR = ['citizenship', 'intl_passport', 'visa', 'driver_license', 'letter_president', 'gang_complaint']

function Stat({ to, label, value }: { to: string; label: string; value: string }) {
  return (
    <Link to={to} className="rounded-xl bg-brand-50 p-4 hover:bg-brand-100">
      <div className="text-xs font-bold uppercase tracking-wide text-brand-700">{label}</div>
      <div className="mt-1 text-xl font-black text-ink">{value}</div>
    </Link>
  )
}

function Dashboard() {
  const { t, coins, num } = useI18n()
  const { profile } = useAuth()
  const docs = useMyDocuments()
  const apps = useMyApplications()
  const fines = useMyFines()
  const staff = isStaff(profile)
  const queue = useStaffApplications(true)
  if (!profile) return null
  const activeDocs = (docs.data ?? []).filter((d) => !d.revoked_at).length
  const openApps = (apps.data ?? []).filter((a) => a.status === 'submitted' || a.status === 'needs_info').length
  const unpaid = (fines.data ?? []).filter((f) => f.status === 'unpaid').length

  return (
    <Card className="mb-8">
      <h1 className="text-2xl font-black">{t('home.hello', { name: profile.display_name })}</h1>
      {!profile.country_code && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>{t('home.noCitizenship')}</span>
          <ButtonLink to="/services/citizenship">{t('home.getCitizenship')}</ButtonLink>
        </div>
      )}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat to="/cabinet/wallet" label={t('home.balance')} value={coins(profile.balance)} />
        <Stat to="/cabinet/documents" label={t('home.myDocs')} value={num(activeDocs)} />
        <Stat to="/cabinet/applications" label={t('home.myApps')} value={num(openApps)} />
        <Stat to="/cabinet/fines" label={t('home.unpaidFines')} value={num(unpaid)} />
      </div>
      {staff && (queue.data?.length ?? 0) > 0 && (
        <div className="mt-4">
          <Alert tone="yellow">
            <Link to="/gov" className="font-bold hover:underline">
              {t('home.govQueue', { count: num(queue.data!.length) })}
            </Link>
          </Alert>
        </div>
      )}
    </Card>
  )
}

function Hero() {
  const { t } = useI18n()
  return (
    <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-900 p-8 text-white sm:p-12">
      <div className="relative z-10 max-w-xl">
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">{t('home.guestTitle')}</h1>
        <p className="mt-3 text-brand-100">{t('home.guestText')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink to="/register" variant="secondary">
            {t('nav.register')}
          </ButtonLink>
          <ButtonLink to="/login" className="bg-white/15 hover:bg-white/25">
            {t('nav.login')}
          </ButtonLink>
        </div>
      </div>
      <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full border-[28px] border-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 rounded-full bg-accent-500/30 blur-2xl" />
    </div>
  )
}

export function HomePage() {
  const { t } = useI18n()
  const { session } = useAuth()
  const services = useServices()
  const news = useNews(4)
  const { profile } = useAuth()
  // Гражданину вместо «Получения гражданства» показываем «Смену гражданства».
  const codes = profile?.country_code ? POPULAR.map((c) => (c === 'citizenship' ? 'change_citizenship' : c)) : POPULAR
  const popular = codes.map((c) => services.data?.find((s) => s.code === c && s.active)).filter((s) => s !== undefined)

  return (
    <>
      {session ? <Dashboard /> : <Hero />}

      <SectionTitle
        action={
          <Link to="/services" className="text-sm font-bold text-brand-700 hover:underline">
            {t('catalog.title')} →
          </Link>
        }
      >
        {t('home.popular')}
      </SectionTitle>
      {services.isLoading ? (
        <Loading />
      ) : (
        <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {popular.map((s) => (
            <ServiceTile key={s.code} service={s} />
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionTitle
            action={
              <Link to="/news" className="text-sm font-bold text-brand-700 hover:underline">
                {t('home.allNews')} →
              </Link>
            }
          >
            {t('home.latestNews')}
          </SectionTitle>
          {news.isLoading ? (
            <Loading />
          ) : news.data?.length ? (
            <div className="space-y-3">
              {news.data.map((n) => (
                <NewsCard key={n.id} item={n} />
              ))}
            </div>
          ) : (
            <Empty>{t('news.empty')}</Empty>
          )}
        </div>
        <Card className="self-start text-center">
          <div className="text-sm font-bold uppercase tracking-wide text-muted">{t('home.time')}</div>
          <div className="mt-2 text-4xl font-black text-brand-700">{LORE_DATE}</div>
          <div className="mt-1 text-muted">12:34</div>
        </Card>
      </div>
    </>
  )
}
