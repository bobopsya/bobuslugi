import { AppStatusBadge } from './badges'
import { Card, Row } from './ui'
import { useI18n } from '../lib/i18n'
import { useCountryName, useProfileMap } from '../lib/queries'
import { serviceDef } from '../lib/services'
import type { Application } from '../lib/types'

export function ApplicationDetails({ app, showApplicant }: { app: Application; showApplicant?: boolean }) {
  const { t, date, coins, lang } = useI18n()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  const def = serviceDef(app.service_code)
  const applicant = profileOf(app.user_id)
  const reviewer = profileOf(app.reviewer_id)
  const fieldLabel = (name: string) => {
    const f = def?.fields.find((x) => x.name === name)
    return t(`fields.${f?.label ?? name}`)
  }
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black sm:text-2xl">
          {def?.icon} {t(`services.${app.service_code}.title`)} {t('common.number')}
          {app.id}
        </h1>
        <AppStatusBadge status={app.status} />
      </div>
      {showApplicant && (
        <Row label={t('gov.applicant')}>
          {applicant ? `${applicant.display_name} (@${applicant.login})` : '…'}
          {applicant && (
            <span className="ml-2 font-normal text-muted">
              {applicant.country_code ? countryName(applicant.country_code, lang === 'psy') : t('common.noCountry')}
            </span>
          )}
        </Row>
      )}
      <Row label={t('common.country')}>{countryName(app.target_country, lang === 'psy')}</Row>
      <Row label={t('cabinet.submittedAt')}>{date(app.created_at, true)}</Row>
      <Row label={t('cabinet.fee')}>{app.fee > 0 ? coins(app.fee) : t('catalog.free')}</Row>
      {Object.entries(app.data ?? {}).map(([k, v]) => (
        <Row key={k} label={fieldLabel(k)}>
          <span className="whitespace-pre-wrap font-normal">{String(v)}</span>
        </Row>
      ))}
      {app.reviewed_at && (
        <Row label={t('cabinet.reviewedAt')}>
          {date(app.reviewed_at, true)}
          {reviewer && <span className="ml-2 font-normal text-muted">{reviewer.display_name}</span>}
        </Row>
      )}
      {app.reviewer_comment && (
        <div className="mt-4 rounded-xl bg-brand-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-700">{t('cabinet.reviewerComment')}</div>
          <p className="mt-1 whitespace-pre-wrap" data-testid="reviewer-comment">
            {app.reviewer_comment}
          </p>
        </div>
      )}
    </Card>
  )
}
