import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApplicationDetails } from '../../components/ApplicationDetails'
import { PdfButton } from '../../components/PdfButton'
import { SignaturePad } from '../../components/SignaturePad'
import { SlotPicker } from '../../components/SlotPicker'
import { isReady, StatusTimeline } from '../../components/StatusTimeline'
import { Alert, Button, Card, ErrorBox, Field, Loading, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useApplication, useServices, useSlot } from '../../lib/queries'
import { uploadFile } from '../../lib/storage'
import { NotFoundPage } from '../MiscPages'

function slotTime(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function ApplicationPage() {
  const { id } = useParams()
  const appId = Number(id)
  const { t, date } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const { data: app, isLoading } = useApplication(appId)
  const services = useServices()
  const slot = useSlot(app?.slot_id)
  const [reply, setReply] = useState('')
  const [newSlot, setNewSlot] = useState<number | null>(null)
  const [signature, setSignature] = useState<Blob | null>(null)

  const cancel = useAction(() => callRpc('cancel_application', { p_id: appId }))
  const answer = useAction(() => callRpc('update_application', { p_id: appId, p_data: { reply: reply.trim() } }), () => setReply(''))
  const rebook = useAction(() => callRpc('rebook_appointment', { p_app: appId, p_slot: newSlot }), () => setNewSlot(null))
  const receive = useAction(async () => {
    const path = await uploadFile('signatures', profile!.id, signature!)
    return callRpc('receive_document', { p_app: appId, p_signature_path: path })
  })

  if (isLoading) return <Loading />
  if (!app) return <NotFoundPage />
  const svc = services.data?.find((s) => s.code === app.service_code)
  const open = app.status === 'submitted' || app.status === 'needs_info' || app.status === 'appointment'
  const ready = isReady(app)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/cabinet/applications" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('cabinet.applications')}
      </Link>

      <Card>
        <StatusTimeline app={app} svc={svc} />
      </Card>

      {app.status === 'appointment' && (
        <Card className="space-y-3">
          <h2 className="text-lg font-black">📅 {t('docflow.stage.appointment')}</h2>
          {app.slot_id && slot.data ? (
            <Alert tone="blue">
              <span data-testid="appointment-info">
                {t('docflow.appointmentAt', { time: slotTime(slot.data.starts_at), place: slot.data.place })}
              </span>
            </Alert>
          ) : (
            <Alert tone="yellow">{t('docflow.appointmentMissed')}</Alert>
          )}
          <details open={!app.slot_id}>
            <summary className="cursor-pointer text-sm font-bold text-brand-700">{t('docflow.rebook')}</summary>
            <div className="mt-3 space-y-3">
              <SlotPicker country={app.target_country} value={newSlot} onChange={setNewSlot} />
              <ErrorBox error={rebook.error} />
              <Button type="button" onClick={() => rebook.run()} disabled={!newSlot} loading={rebook.pending}>
                {t('docflow.rebookConfirm')}
              </Button>
            </div>
          </details>
        </Card>
      )}

      {app.status === 'producing' && (
        <Card className="space-y-3">
          {ready ? (
            <>
              <h2 className="text-lg font-black">🎉 {t('docflow.readyTitle')}</h2>
              <p>{t('docflow.readyText')}</p>
              <Field label={t('docflow.receiptSignature')}>
                <SignaturePad onChange={setSignature} />
              </Field>
              <ErrorBox error={receive.error} />
              {receive.done ? (
                <Alert tone="green">
                  {t('docflow.received')}{' '}
                  <Link to="/cabinet/documents" className="font-bold underline">
                    {t('cabinet.documents')} →
                  </Link>
                </Alert>
              ) : (
                <Button type="button" onClick={() => receive.run()} disabled={!signature} loading={receive.pending}>
                  {t('docflow.receive')}
                </Button>
              )}
            </>
          ) : (
            <>
              <h2 className="text-lg font-black">🏭 {t('docflow.stage.producing')}</h2>
              <p>{t('docflow.producingText', { time: date(app.ready_at, true) })}</p>
            </>
          )}
        </Card>
      )}

      {app.status === 'issued' && (
        <Alert tone="green">
          {t('docflow.issuedText', { time: date(app.received_at, true) })}{' '}
          <Link to="/cabinet/documents" className="font-bold underline">
            {t('cabinet.documents')} →
          </Link>
        </Alert>
      )}

      <ApplicationDetails app={app} />

      <div className="flex flex-wrap gap-2">
        <PdfButton label={t('pdf.application')} make={async () => (await pdf()).applicationPdf(ctx, app)} />
        {app.reviewed_at && app.status !== 'needs_info' && (
          <PdfButton label={t('pdf.decision')} make={async () => (await pdf()).decisionPdf(ctx, app)} />
        )}
      </div>

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
