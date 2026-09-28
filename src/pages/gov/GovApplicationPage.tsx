import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationDetails } from '../../components/ApplicationDetails'
import { Alert, Button, Card, ErrorBox, Field, Loading, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { useApplication } from '../../lib/queries'
import { NotFoundPage } from '../MiscPages'

type Decision = 'approve' | 'reject' | 'needs_info'

export function GovApplicationPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const { data: app, isLoading } = useApplication(Number(id))
  const [comment, setComment] = useState('')
  const review = useAction((decision: Decision) => callRpc('review_application', { p_id: Number(id), p_decision: decision, p_comment: comment }))

  if (isLoading) return <Loading />
  if (!app) return <NotFoundPage />
  const canDecide = app.status === 'submitted'
  const canReject = canDecide || app.status === 'needs_info'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/gov" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('gov.queue')}
      </Link>
      <ApplicationDetails app={app} showApplicant />
      {canReject && (
        <Card>
          <Field label={t('common.comment')}>
            <Textarea name="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('gov.commentPh')} maxLength={2000} />
          </Field>
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
              <Button onClick={() => review.run('approve')} loading={review.pending}>
                {t('gov.approve')}
              </Button>
            )}
            {canDecide && (
              <Button variant="secondary" onClick={() => review.run('needs_info')} loading={review.pending}>
                {t('gov.needsInfo')}
              </Button>
            )}
            <Button variant="danger" onClick={() => review.run('reject')} loading={review.pending}>
              {t('gov.reject')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
