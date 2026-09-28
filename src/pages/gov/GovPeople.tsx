import { useState } from 'react'
import { DocumentCard } from '../../components/DocumentCard'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, Select } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountryName, useProfiles, useUserDocuments } from '../../lib/queries'
import type { Profile } from '../../lib/types'

function CoinsForm({ person }: { person: Profile }) {
  const { t } = useI18n()
  const [amount, setAmount] = useState('')
  const [comment, setComment] = useState('')
  const grant = useAction(() => callRpc('grant_coins', { p_user: person.id, p_amount: Number(amount), p_comment: comment }), () => {
    setAmount('')
    setComment('')
  })
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        grant.run()
      }}
    >
      <h3 className="font-black">{t('gov.grant')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.amount')}>
          <Input name="coins" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label={t('common.comment')}>
          <Input name="coinsComment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} />
        </Field>
      </div>
      <ErrorBox error={grant.error} />
      {grant.done && <Alert tone="green">{t('common.done')}</Alert>}
      <Button type="submit" loading={grant.pending}>
        {t('gov.grant')}
      </Button>
    </form>
  )
}

function FineForm({ person }: { person: Profile }) {
  const { t } = useI18n()
  const { profile } = useAuth()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [kind, setKind] = useState<'fine' | 'tax'>('fine')
  const issue = useAction(
    () =>
      callRpc('issue_fine', {
        p_user: person.id,
        p_amount: Number(amount),
        p_reason: reason,
        p_kind: kind,
        p_country: profile?.role === 'superadmin' ? person.country_code : null,
      }),
    () => {
      setAmount('')
      setReason('')
    },
  )
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        issue.run()
      }}
    >
      <h3 className="font-black">{t('gov.fine')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('common.status')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as 'fine' | 'tax')}>
            <option value="fine">{t('fineKind.fine')}</option>
            <option value="tax">{t('fineKind.tax')}</option>
          </Select>
        </Field>
        <Field label={t('common.amount')}>
          <Input name="fineAmount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label={t('common.reason')}>
          <Input name="fineReason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} required />
        </Field>
      </div>
      <ErrorBox error={issue.error} />
      {issue.done && <Alert tone="green">{t('common.done')}</Alert>}
      <Button type="submit" variant="danger" loading={issue.pending}>
        {kind === 'tax' ? t('gov.tax') : t('gov.fine')}
      </Button>
    </form>
  )
}

function PersonDocs({ person }: { person: Profile }) {
  const { t } = useI18n()
  const { profile } = useAuth()
  const { data, isLoading } = useUserDocuments(person.id)
  const revoke = useAction((a: { id: number; reason: string }) => callRpc('revoke_document', { p_id: a.id, p_reason: a.reason }))
  if (isLoading) return <Loading />
  if (!data?.length) return <p className="text-sm text-muted">{t('common.none')}</p>
  const canRevoke = (country: string) => profile?.role === 'superadmin' || profile?.gov_country_code === country
  return (
    <>
      <ErrorBox error={revoke.error} />
      <div className="grid gap-3 md:grid-cols-2">
        {data.map((d) => (
          <DocumentCard
            key={d.id}
            doc={d}
            holder={person}
            action={
              !d.revoked_at && canRevoke(d.country_code) ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const reason = prompt(t('common.reason'))
                    if (reason !== null) revoke.run({ id: d.id, reason })
                  }}
                >
                  {t('gov.revoke')}
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>
    </>
  )
}

function PersonPanel({ person }: { person: Profile }) {
  const { t, coins, lang } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  const appoint = useAction((on: boolean) => callRpc('president_set_official', { p_user: person.id, p_on: on }))
  if (!profile) return null
  const isPresidentHere = profile.role === 'president' && person.country_code === profile.gov_country_code
  const canGrant = profile.role === 'superadmin' || isPresidentHere

  return (
    <Card className="space-y-6">
      <div>
        <div className="text-xl font-black">{person.display_name}</div>
        <div className="text-sm text-muted">
          @{person.login} · {t(`roles.${person.role}`)} · {person.country_code ? countryName(person.country_code, lang === 'psy') : t('common.noCountry')} ·{' '}
          {coins(person.balance)}
        </div>
      </div>
      {isPresidentHere && person.id !== profile.id && (person.role === 'citizen' || person.role === 'official') && (
        <div>
          <ErrorBox error={appoint.error} />
          <Button variant="secondary" onClick={() => appoint.run(person.role === 'citizen')} loading={appoint.pending}>
            {person.role === 'citizen' ? t('gov.appoint') : t('gov.dismiss')}
          </Button>
        </div>
      )}
      {canGrant && <CoinsForm person={person} />}
      <FineForm person={person} />
      <div>
        <h3 className="mb-3 font-black">{t('gov.docs')}</h3>
        <PersonDocs person={person} />
      </div>
    </Card>
  )
}

export function GovPeople() {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  const { data, isLoading } = useProfiles()
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [everyone, setEveryone] = useState(false)
  if (isLoading) return <Loading />
  if (!profile) return null

  const admin = profile.role === 'superadmin'
  const list = (data ?? [])
    .filter((p) => admin || everyone || p.country_code === profile.gov_country_code)
    .filter((p) => !q || `${p.login} ${p.display_name}`.toLowerCase().includes(q.toLowerCase()))
  const person = data?.find((p) => p.id === selected)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        {!admin && (
          <>
            <p className="mb-2 text-sm text-muted">{t('gov.citizensOf', { country: countryName(profile.gov_country_code, lang === 'psy') })}</p>
            <label className="mb-3 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="h-4 w-4" />
              {t('common.all')}
            </label>
          </>
        )}
        <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
        {list.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
            {list.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={`flex w-full items-center gap-3 p-3 text-left hover:bg-brand-50/50 ${selected === p.id ? 'bg-brand-50' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{p.display_name}</span>
                  <span className="block truncate text-xs text-muted">@{p.login}</span>
                </span>
                {p.role !== 'citizen' && <Badge tone="blue">{t(`roles.${p.role}`)}</Badge>}
                {p.banned && <Badge tone="red">ban</Badge>}
              </button>
            ))}
          </div>
        ) : (
          <Empty />
        )}
        {!admin && <p className="mt-3 text-xs text-muted">{t('gov.residentsNote')}</p>}
      </div>
      <div>{person ? <PersonPanel key={person.id} person={person} /> : <Empty>{t('common.user')} →</Empty>}</div>
    </div>
  )
}
