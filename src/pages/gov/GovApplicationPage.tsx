import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationDetails } from '../../components/ApplicationDetails'
import { PdfButton } from '../../components/PdfButton'
import { isReady, StatusTimeline } from '../../components/StatusTimeline'
import { Alert, Button, Card, ErrorBox, Field, Loading, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useApplication, useExamAttempt, useServices, useSlot } from '../../lib/queries'
import { NotFoundPage } from '../MiscPages'

type Decision = 'approve' | 'reject' | 'needs_info'

export function GovApplicationPage() {
  const { id } = useParams()
  const appId = Number(id)
  const { t, raw, num, date } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const { data: app, isLoading } = useApplication(appId)
  const services = useServices()
  const slot = useSlot(app?.slot_id)
  const exam = useExamAttempt(app?.exam_attempt_id)
  const [comment, setComment] = useState('')
  const review = useAction((decision: Decision) => callRpc('review_application', { p_id: appId, p_decision: decision, p_comment: comment }))
  const attend = useAction((attended: boolean) => callRpc('mark_attendance', { p_app: appId, p_attended: attended }))
  const speedUp = useAction(() => callRpc('speed_up_production', { p_app: appId }))

  if (isLoading) return <Loading />
  if (!app) return <NotFoundPage />
  const svc = services.data?.find((s) => s.code === app.service_code)
  const canDecide = app.status === 'submitted'
  const canReject = canDecide || app.status === 'needs_info' || app.status === 'appointment'
  const templates = raw<string[]>('docflow.rejectTemplates') ?? []
  const noSignature = !profile?.signature_path

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/gov" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('gov.queue')}
      </Link>

      <Card>
        <StatusTimeline app={app} svc={svc} />
      </Card>

      {exam.data && (
        <Alert tone={exam.data.passed ? 'green' : 'red'}>
          {t('docflow.examScore', { score: num(exam.data.score ?? 0), total: num(exam.data.question_ids.length), date: date(exam.data.finished_at) })}
        </Alert>
      )}

      {app.status === 'appointment' && (
        <Card className="space-y-3">
          <h2 className="text-lg font-black">📅 {t('docflow.stage.appointment')}</h2>
          {slot.data ? (
            <p>
              {t('docflow.appointmentAt', {
                time: new Date(slot.data.starts_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }),
                place: slot.data.place,
              })}
            </p>
          ) : (
            <Alert tone="yellow">{t('docflow.waitingRebook')}</Alert>
          )}
          <ErrorBox error={attend.error} />
          {slot.data && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => attend.run(true)} loading={attend.pending}>
                ✓ {t('docflow.attended')}
              </Button>
              <Button variant="secondary" onClick={() => attend.run(false)} loading={attend.pending}>
                ✗ {t('docflow.noShow')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {app.status === 'producing' && (
        <Card className="space-y-3">
          {isReady(app) ? (
            <Alert tone="green">{t('docflow.readyForPickup')}</Alert>
          ) : (
            <>
              <p>{t('docflow.producingText', { time: date(app.ready_at, true) })}</p>
              <ErrorBox error={speedUp.error} />
              <Button onClick={() => speedUp.run()} loading={speedUp.pending}>
                {t('docflow.speedUp')}
              </Button>
            </>
          )}
        </Card>
      )}

      <ApplicationDetails app={app} showApplicant />

      <div className="flex flex-wrap gap-2">
        <PdfButton label={t('pdf.application')} make={async () => (await pdf()).applicationPdf(ctx, app)} />
        {app.reviewed_at && app.status !== 'needs_info' && (
          <PdfButton label={t('pdf.decision')} make={async () => (await pdf()).decisionPdf(ctx, app)} />
        )}
      </div>

      {canReject && (
        <Card>
          {noSignature && (
            <div className="mb-4">
              <Alert tone="yellow">
                {t('docflow.needSignatureFirst')}{' '}
                <Link to="/cabinet/settings" className="font-bold underline">
                  {t('cabinet.settings')} →
                </Link>
              </Alert>
            </div>
          )}
          <Field label={t('common.comment')}>
            <Textarea name="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('gov.commentPh')} maxLength={2000} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {templates.map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setComment(tpl)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                {tpl}
              </button>
            ))}
          </div>
          <div className="mt-4">
            <ErrorBox error={review.error} />
          </div>
          {review.done && (
            <div className="mt-3">
              <Alert tone="green">{t('common.done')}</Alert>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {canDecide && (
              <Button onClick={() => review.run('approve')} loading={review.pending} disabled={noSignature}>
                {t('gov.approve')}
              </Button>
            )}
            {canDecide && (
              <Button variant="secondary" onClick={() => review.run('needs_info')} loading={review.pending}>
                {t('gov.needsInfo')}
              </Button>
            )}
            <Button variant="danger" onClick={() => review.run('reject')} loading={review.pending} disabled={noSignature}>
              {t('gov.reject')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
