import { CabinetNav } from '../../components/CabinetNav'
import { Card, PageTitle, Row } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountryName } from '../../lib/queries'

export function CabinetPage() {
  const { t, coins, date, lang } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  if (!profile) return null
  return (
    <>
      <PageTitle>{t('cabinet.title')}</PageTitle>
      <CabinetNav />
      <Card>
        <div className="mb-4 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-2xl font-black text-white">
            {profile.display_name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <div className="text-xl font-black">{profile.display_name}</div>
            <div className="text-muted">@{profile.login}</div>
          </div>
        </div>
        <Row label={t('cabinet.role')}>{t(`roles.${profile.role}`)}</Row>
        <Row label={t('cabinet.citizenship')}>
          {profile.country_code ? countryName(profile.country_code, lang === 'psy') : t('common.noCountry')}
        </Row>
        <Row label={t('cabinet.city')}>{profile.city ?? '—'}</Row>
        {profile.gov_country_code && <Row label={t('cabinet.govCountry')}>{countryName(profile.gov_country_code, lang === 'psy')}</Row>}
        <Row label={t('home.balance')}>
          <span data-testid="balance">{coins(profile.balance)}</span>
        </Row>
        <Row label={t('common.date')}>{date(profile.created_at)}</Row>
      </Card>
    </>
  )
}
