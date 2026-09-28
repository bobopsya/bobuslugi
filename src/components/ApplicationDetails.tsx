import { AppStatusBadge } from './badges'
import { Card, Row } from './ui'
import { useI18n } from '../lib/i18n'
import { useCountryName, useProfileMap } from '../lib/queries'
import { orderedEntries, serviceDef } from '../lib/services'
import { useSignedUrl } from '../lib/storage'
import type { Application } from '../lib/types'

export function ApplicationDetails({ app, showApplicant }: { app: Application; showApplicant?: boolean }) {
  const { t, date, coins, lang } = useI18n()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  const def = serviceDef(app.service_code)
  const applicant = profileOf(app.user_id)
  const reviewer = profileOf(app.reviewer_id)
  const photo = useSignedUrl('photos', app.photo_path)
  const sig = useSignedUrl('signatures', app.signature_path)
  const fieldLabel = (name: string) => {
    const f = def?.fields.find((x) => x.name === name)
    return t(`fields.${f?.label ?? name}`)
  }
  const fieldValue = (name: string, v: string) =>
    name === 'birth_date' ? date(v) : name === 'sex' ? t(`docflow.sex.${v}`) : name === 'oath' ? t('docflow.oathAccept') : v
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
      {(photo.data || sig.data) && (
        <div className="mb-3 flex items-end gap-4">
          {photo.data && <img src={photo.data} alt="" data-testid="application-photo" className="h-40 w-30 rounded-lg object-cover ring-1 ring-slate-300" />}
          {sig.data && (
            <div>
              <div className="text-xs text-muted">{t('docflow.applicantSignature')}</div>
              <img src={sig.data} alt="" className="h-12 max-w-48 object-contain" />
            </div>
          )}
        </div>
      )}
      <Row label={t('common.country')}>{countryName(app.target_country, lang === 'psy')}</Row>
      <Row label={t('cabinet.submittedAt')}>{date(app.created_at, true)}</Row>
      <Row label={t('cabinet.fee')}>{app.fee > 0 ? coins(app.fee) : t('catalog.free')}</Row>
      {orderedEntries(app.service_code, app.data).map(([k, v]) => (
        <Row key={k} label={k === 'oath' ? t('docflow.step.oath') : fieldLabel(k)}>
          <span className="whitespace-pre-wrap font-normal">{fieldValue(k, String(v))}</span>
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
