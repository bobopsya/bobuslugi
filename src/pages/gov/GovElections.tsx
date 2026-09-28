import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ElectionStatusBadge } from '../../components/badges'
import { CountrySelect } from '../../components/CountrySelect'
import { Button, Card, ErrorBox, Field, Input, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useElections } from '../../lib/queries'

export function GovElections() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data } = useElections()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [country, setCountry] = useState('BOBO')
  const create = useAction(
    () => callRpc<{ ok: true; id: number }>('create_election', { p_title: title, p_description: desc, p_country: country }),
    (r) => navigate(`/elections/${r.id}`),
  )
  if (!profile) return null
  const canCreate = profile.role === 'president' || profile.role === 'superadmin'
  const mine = (data ?? []).filter((e) => profile.role === 'superadmin' || e.country_code === profile.gov_country_code)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canCreate && (
        <Card>
          <h2 className="mb-3 font-black">{t('gov.createElection')}</h2>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              create.run()
            }}
          >
            {profile.role === 'superadmin' && (
              <Field label={t('gov.countryForAdmin')}>
                <CountrySelect value={country} onChange={setCountry} />
              </Field>
            )}
            <Field label={t('gov.electionTitle')}>
              <Input name="electionTitle" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
            </Field>
            <Field label={t('gov.electionDesc')}>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} rows={3} />
            </Field>
            <ErrorBox error={create.error} />
            <Button type="submit" loading={create.pending}>
              {t('gov.createElection')}
            </Button>
          </form>
        </Card>
      )}
      <div className="space-y-2">
        {mine.map((e) => (
          <Link key={e.id} to={`/elections/${e.id}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200/70 hover:ring-brand-200">
            <span className="font-bold">{e.title}</span>
            <ElectionStatusBadge status={e.status} />
          </Link>
        ))}
      </div>
    </div>
  )
}
