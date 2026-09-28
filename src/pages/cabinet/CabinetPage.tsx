import { CabinetNav } from '../../components/CabinetNav'
import { PdfButton } from '../../components/PdfButton'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { Card, PageTitle, Row } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountryName, useMyDocuments, useMyFines } from '../../lib/queries'

export function CabinetPage() {
  const { t, coins, date, lang } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  const ctx = usePdfCtx()
  const docs = useMyDocuments()
  const fines = useMyFines()
  if (!profile) return null
  const passport = (docs.data ?? []).find((d) => d.type === 'passport' && !d.revoked_at)
  const unpaid = (fines.data ?? []).filter((f) => f.status === 'unpaid').reduce((s, f) => s + f.amount, 0)
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
      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-black">{t('pdf.certificates')}</h2>
        <p className="mb-4 text-sm text-muted">{t('pdf.certificatesHint')}</p>
        <div className="flex flex-wrap gap-2">
          <PdfButton label={t('pdf.citizenshipCert')} make={async () => (await pdf()).certificatePdf(ctx, 'citizenship', profile, passport, unpaid)} />
          <PdfButton label={t('pdf.noDebtCert')} make={async () => (await pdf()).certificatePdf(ctx, 'no_debt', profile, passport, unpaid)} />
        </div>
      </Card>
    </>
  )
}
