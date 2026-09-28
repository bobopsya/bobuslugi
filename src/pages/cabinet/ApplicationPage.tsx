import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationDetails } from '../../components/ApplicationDetails'
import { Button, Card, ErrorBox, Field, Loading, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { useApplication } from '../../lib/queries'
import { NotFoundPage } from '../MiscPages'

export function ApplicationPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const { data: app, isLoading } = useApplication(Number(id))
  const [reply, setReply] = useState('')
  const cancel = useAction(() => callRpc('cancel_application', { p_id: Number(id) }))
  const answer = useAction(() => callRpc('update_application', { p_id: Number(id), p_data: { reply: reply.trim() } }), () => setReply(''))

  if (isLoading) return <Loading />
  if (!app) return <NotFoundPage />
  const open = app.status === 'submitted' || app.status === 'needs_info'

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/cabinet/applications" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('cabinet.applications')}
      </Link>
      <ApplicationDetails app={app} />
      {app.status === 'needs_info' && (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              answer.run()
            }}
            className="space-y-3"
          >
            <Field label={t('fields.reply')}>
              <Textarea name="reply" value={reply} onChange={(e) => setReply(e.target.value)} required maxLength={2000} />
            </Field>
            <ErrorBox error={answer.error} />
            <Button type="submit" loading={answer.pending}>
              {t('cabinet.answer')}
            </Button>
          </form>
        </Card>
      )}
      {open && (
        <div>
          <ErrorBox error={cancel.error} />
          <Button
            variant="ghost"
            loading={cancel.pending}
            onClick={() => {
              if (confirm(t('common.confirm'))) cancel.run()
            }}
          >
            {t('cabinet.cancelApp')}
          </Button>
        </div>
      )}
    </div>
  )
}
