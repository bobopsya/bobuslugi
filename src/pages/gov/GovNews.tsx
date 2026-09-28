import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CountrySelect } from '../../components/CountrySelect'
import { Button, Card, ErrorBox, Field, Input, Select, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'

export function GovNews() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [kind, setKind] = useState<'news' | 'decree'>('news')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [country, setCountry] = useState('')
  const post = useAction(
    () => callRpc<{ ok: true; id: number }>('post_news', { p_kind: kind, p_title: title, p_body: body, p_country: country || null }),
    (r) => navigate(`/news/${r.id}`),
  )
  if (!profile) return null
  const canDecree = profile.role === 'president' || profile.role === 'superadmin'
  return (
    <Card className="max-w-2xl">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          post.run()
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('common.status')}>
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as 'news' | 'decree')}>
              <option value="news">{t('newsKind.news')}</option>
              {canDecree && <option value="decree">{t('newsKind.decree')}</option>}
            </Select>
          </Field>
          {profile.role === 'superadmin' && (
            <Field label={t('gov.countryForAdmin')}>
              <CountrySelect value={country} onChange={setCountry} allowEmpty emptyLabel={t('common.planet')} />
            </Field>
          )}
        </div>
        <Field label={t('gov.newsTitle')}>
          <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </Field>
        <Field label={t('gov.newsBody')}>
          <Textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} maxLength={10000} required />
        </Field>
        <ErrorBox error={post.error} />
        <Button type="submit" loading={post.pending}>
          {t('gov.publish')}
        </Button>
      </form>
    </Card>
  )
}
