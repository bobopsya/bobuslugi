import { useState } from 'react'
import { CabinetNav } from '../../components/CabinetNav'
import { Alert, Button, Card, ErrorBox, Field, Input, PageTitle } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'

export function SettingsPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const save = useAction(() => callRpc('update_profile', { p_display_name: name, p_city: city }))

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
    </>
  )
}
