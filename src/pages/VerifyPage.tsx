import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Button, Card, Input, Loading, PageTitle, Row } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useCountryName } from '../lib/queries'
import { supabase } from '../lib/supabase'

type Verdict = {
  found: boolean
  type?: string
  country_code?: string
  issued_at?: string
  valid_until?: string | null
  revoked?: boolean
  valid?: boolean
}

/** Публичная проверка подлинности документа по номеру (ссылка из QR-кода в PDF). */
export function VerifyPage() {
  const { number = '' } = useParams()
  const navigate = useNavigate()
  const { t, date, lang } = useI18n()
  const countryName = useCountryName()
  const [input, setInput] = useState(number)
  const { data, isLoading } = useQuery({
    queryKey: ['verify', number],
    enabled: Boolean(number),
    queryFn: async () => (await supabase.rpc('verify_document', { p_number: number })).data as Verdict,
  })

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle sub={t('verify.subtitle')}>{t('verify.title')}</PageTitle>
      <Card className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            navigate(`/verify/${encodeURIComponent(input.trim())}`)
          }}
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="1234 321 123 4321 321 1234" />
          <Button type="submit">{t('verify.check')}</Button>
        </form>
        {number && isLoading && <Loading />}
        {data && !data.found && <Alert tone="red">{t('verify.notFound')}</Alert>}
        {data?.found && (
          <>
            <Alert tone={data.valid ? 'green' : 'red'}>
              <span data-testid="verify-result">{data.valid ? t('verify.valid') : data.revoked ? t('verify.revoked') : t('verify.expired')}</span>
            </Alert>
            <div>
              <Row label={t('cabinet.docNumber')}>{number}</Row>
              <Row label={t('common.status')}>{t(`docs.${data.type}`)}</Row>
              <Row label={t('common.country')}>{countryName(data.country_code, lang === 'psy')}</Row>
              <Row label={t('cabinet.issued')}>{date(data.issued_at)}</Row>
              <Row label={t('cabinet.validUntil')}>{data.valid_until ? date(data.valid_until) : t('cabinet.forever')}</Row>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
