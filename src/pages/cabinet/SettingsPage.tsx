import { useState } from 'react'
import { CabinetNav } from '../../components/CabinetNav'
import { Alert, Button, Card, ErrorBox, Field, Input, PageTitle } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { SignaturePad } from '../../components/SignaturePad'
import { uploadFile, useSignedUrl } from '../../lib/storage'

export function SettingsPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const save = useAction(() => callRpc('update_profile', { p_display_name: name, p_city: city }))
  const [sig, setSig] = useState<Blob | null>(null)
  const current = useSignedUrl('signatures', profile?.signature_path)
  const saveSig = useAction(async () => {
    const path = await uploadFile('signatures', profile!.id, sig!)
    return callRpc('set_signature', { p_path: path })
  })

  return (
    <>
      <PageTitle>{t('cabinet.settings')}</PageTitle>
      <CabinetNav />
      <Card className="max-w-xl">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.run()
          }}
        >
          <Field label={t('auth.displayName')}>
            <Input name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </Field>
          <Field label={t('cabinet.city')}>
            <Input name="city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
          </Field>
          <ErrorBox error={save.error} />
          {save.done && <Alert tone="green">{t('cabinet.saved')}</Alert>}
          <Button type="submit" loading={save.pending}>
            {t('common.save')}
          </Button>
        </form>
      </Card>

      <Card className="mt-6 max-w-xl space-y-3">
        <h2 className="text-lg font-black">{t('docflow.mySignature')}</h2>
        <p className="text-sm text-muted">{t('docflow.mySignatureHint')}</p>
        {current.data && (
          <div>
            <div className="text-xs text-muted">{t('docflow.currentSignature')}</div>
            <img src={current.data} alt="" data-testid="current-signature" className="h-14 max-w-60 object-contain" />
          </div>
        )}
        <SignaturePad onChange={setSig} />
        <ErrorBox error={saveSig.error} />
        {saveSig.done && <Alert tone="green">{t('cabinet.saved')}</Alert>}
        <Button type="button" onClick={() => saveSig.run()} disabled={!sig} loading={saveSig.pending}>
          {t('docflow.saveSignature')}
        </Button>
      </Card>
    </>
  )
}
