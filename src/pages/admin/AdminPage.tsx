import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { Alert, Badge, Button, Card, ErrorBox, Field, Input, Loading, PageTitle, Select, Tabs } from '../../components/ui'
import { callRpc, unwrap, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useProfileMap, useProfiles, useServices } from '../../lib/queries'
import { supabase } from '../../lib/supabase'
import type { AuditEntry, Profile, Role, ServiceRow } from '../../lib/types'

const ROLES: Role[] = ['citizen', 'official', 'president', 'superadmin']

function UserRow({ user }: { user: Profile }) {
  const { t, coins } = useI18n()
  const { profile: me } = useAuth()
  const [role, setRole] = useState<Role>(user.role)
  const [gov, setGov] = useState(user.gov_country_code ?? 'BOBO')
  const [country, setCountry] = useState(user.country_code ?? '')
  const [amount, setAmount] = useState('')
  const saveRole = useAction(() => callRpc('admin_set_role', { p_user: user.id, p_role: role, p_gov_country: role === 'official' || role === 'president' ? gov : null }))
  const saveCountry = useAction(() => callRpc('admin_set_country', { p_user: user.id, p_country: country || null }))
  const ban = useAction(() => callRpc('admin_set_banned', { p_user: user.id, p_banned: !user.banned }))
  const grant = useAction(() => callRpc('grant_coins', { p_user: user.id, p_amount: Number(amount), p_comment: 'Администрация' }), () => setAmount(''))
  const error = saveRole.error ?? saveCountry.error ?? ban.error ?? grant.error

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-lg font-black">{user.display_name}</span>
        <span className="text-sm text-muted">@{user.login}</span>
        <Badge tone="blue">{t(`roles.${user.role}`)}</Badge>
        {user.banned && <Badge tone="red">ban</Badge>}
        <span className="ml-auto text-sm font-bold">{coins(user.balance)}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Field label={t('admin.role')}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          {(role === 'official' || role === 'president') && (
            <Field label={t('admin.govCountry')}>
              <CountrySelect value={gov} onChange={setGov} />
            </Field>
          )}
          <Button variant="secondary" onClick={() => saveRole.run()} loading={saveRole.pending}>
            {t('admin.setRole')}
          </Button>
        </div>
        <div className="space-y-2">
          <Field label={t('admin.setCountry')}>
            <CountrySelect value={country} onChange={setCountry} allowEmpty emptyLabel={t('common.noCountry')} />
          </Field>
          <Button variant="secondary" onClick={() => saveCountry.run()} loading={saveCountry.pending}>
            {t('common.save')}
          </Button>
        </div>
        <div className="space-y-2">
          <Field label={t('admin.coins')}>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => grant.run()} loading={grant.pending} disabled={!amount}>
              {t('gov.grant')}
            </Button>
            {me?.id !== user.id && (
              <Button variant={user.banned ? 'secondary' : 'danger'} onClick={() => confirm(t('common.confirm')) && ban.run()} loading={ban.pending}>
                {user.banned ? t('admin.unban') : t('admin.ban')}
              </Button>
            )}
          </div>
        </div>
      </div>
      {error ? (
        <div className="mt-3">
          <ErrorBox error={error} />
        </div>
      ) : null}
    </Card>
  )
}

function Users() {
  const { t } = useI18n()
  const { data, isLoading } = useProfiles()
  const [q, setQ] = useState('')
  if (isLoading) return <Loading />
  const list = (data ?? []).filter((p) => !q || `${p.login} ${p.display_name}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <>
      <Input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} className="mb-4 max-w-md" />
      <div className="space-y-3">
        {list.map((u) => (
          <UserRow key={`${u.id}-${u.role}-${u.country_code}-${u.gov_country_code}`} user={u} />
        ))}
      </div>
    </>
  )
}

function ServiceFeeRow({ s }: { s: ServiceRow }) {
  const { t } = useI18n()
  const [fee, setFee] = useState(String(s.fee))
  const [active, setActive] = useState(s.active)
  const save = useAction(() => callRpc('admin_update_service', { p_code: s.code, p_fee: Number(fee), p_active: active }))
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <span className="flex-1 font-bold">{t(`services.${s.code}.title`)}</span>
      <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className="sm:w-28" aria-label={t('admin.fee')} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
        {t('admin.active')}
      </label>
      <Button variant="secondary" onClick={() => save.run()} loading={save.pending}>
        {save.done ? '✓' : t('common.save')}
      </Button>
      {save.error ? <ErrorBox error={save.error} /> : null}
    </div>
  )
}

function Settings() {
  const { t } = useI18n()
  const services = useServices()
  const settings = useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => Object.fromEntries((unwrap(await supabase.from('app_settings').select('*')) as { key: string; value: string }[]).map((r) => [r.key, r.value])),
  })
  const [invite, setInvite] = useState<string | null>(null)
  const [fine, setFine] = useState<string | null>(null)
  const [minutes, setMinutes] = useState<string | null>(null)
  const saveMinutes = useAction(() => callRpc('admin_set_setting', { p_key: 'passport_production_minutes', p_value: minutes ?? '' }))
  const saveInvite = useAction(() => callRpc('admin_set_setting', { p_key: 'invite_code', p_value: invite ?? '' }))
  const saveFine = useAction(() => callRpc('admin_set_setting', { p_key: 'forbidden_fine', p_value: fine ?? '' }))
  if (settings.isLoading) return <Loading />
  const inviteValue = invite ?? settings.data?.invite_code ?? ''
  const fineValue = fine ?? settings.data?.forbidden_fine ?? '123'
  const minutesValue = minutes ?? settings.data?.passport_production_minutes ?? '30'

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="space-y-3">
          {!settings.data?.invite_code && <Alert tone="yellow">{t('admin.inviteWarning')}</Alert>}
          <Field label={t('admin.inviteCode')} hint={t('admin.inviteHint')}>
            <Input name="invite" value={inviteValue} onChange={(e) => setInvite(e.target.value)} />
          </Field>
          <ErrorBox error={saveInvite.error} />
          <Button onClick={() => saveInvite.run()} loading={saveInvite.pending}>
            {saveInvite.done ? '✓' : t('common.save')}
          </Button>
        </Card>
        <Card className="space-y-3">
          <Field label={t('admin.forbiddenFine')}>
            <Input type="number" min={1} value={fineValue} onChange={(e) => setFine(e.target.value)} />
          </Field>
          <ErrorBox error={saveFine.error} />
          <Button onClick={() => saveFine.run()} loading={saveFine.pending}>
            {saveFine.done ? '✓' : t('common.save')}
          </Button>
        </Card>
        <Card className="space-y-3">
          <Field label={t('admin.productionMinutes')} hint={t('admin.productionHint')}>
            <Input type="number" min={0} value={minutesValue} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <ErrorBox error={saveMinutes.error} />
          <Button onClick={() => saveMinutes.run()} loading={saveMinutes.pending}>
            {saveMinutes.done ? '✓' : t('common.save')}
          </Button>
        </Card>
      </div>
      <Card>
        <h2 className="mb-2 font-black">{t('admin.services')}</h2>
        <div className="divide-y divide-slate-100">
          {(services.data ?? []).map((s) => (
            <ServiceFeeRow key={s.code} s={s} />
          ))}
        </div>
      </Card>
    </div>
  )
}

function Audit() {
  const { t, date } = useI18n()
  const profileOf = useProfileMap()
  const { data, isLoading } = useQuery({
    queryKey: ['audit'],
    queryFn: async () => unwrap(await supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(300)) as AuditEntry[],
  })
  if (isLoading) return <Loading />
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-muted">
          <tr>
            <th className="p-3">{t('common.date')}</th>
            <th className="p-3">{t('admin.actor')}</th>
            <th className="p-3">{t('admin.action')}</th>
            <th className="p-3">{t('admin.target')}</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((a) => (
            <tr key={a.id} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap p-3">{date(a.created_at, true)}</td>
              <td className="p-3">{profileOf(a.actor_id)?.login ?? '—'}</td>
              <td className="p-3 font-mono text-xs">{a.action}</td>
              <td className="p-3 font-mono text-xs">
                {profileOf(a.target)?.login ?? a.target}
                {Object.keys(a.details ?? {}).length > 0 && <div className="text-muted">{JSON.stringify(a.details)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState('users')
  return (
    <>
      <PageTitle>{t('admin.title')}</PageTitle>
      <Tabs
        items={[
          { value: 'users', label: t('admin.users') },
          { value: 'settings', label: t('admin.settings') },
          { value: 'audit', label: t('admin.audit') },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'users' && <Users />}
      {tab === 'settings' && <Settings />}
      {tab === 'audit' && <Audit />}
    </>
  )
}
