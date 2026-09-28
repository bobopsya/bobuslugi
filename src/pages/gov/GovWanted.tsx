import { useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { Badge, Button, Card, ErrorBox, Field, Input, Select, Textarea } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useProfiles, useWanted } from '../../lib/queries'

export function GovWanted() {
  const { t, coins } = useI18n()
  const { profile } = useAuth()
  const { data } = useWanted()
  const { data: profiles } = useProfiles()
  const [form, setForm] = useState({ name: '', description: '', reward: '', country: '', linked: '' })
  const create = useAction(
    () =>
      callRpc('wanted_create', {
        p_name: form.name,
        p_description: form.description,
        p_reward: Number(form.reward || 0),
        p_country: form.country || null,
        p_linked_user: form.linked || null,
      }),
    () => setForm({ name: '', description: '', reward: '', country: '', linked: '' }),
  )
  const toggle = useAction((a: { id: number; active: boolean }) => callRpc('wanted_set_active', { p_id: a.id, p_active: a.active }))
  if (!profile) return null
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const mine = (data ?? []).filter((w) => profile.role === 'superadmin' || w.country_code === profile.gov_country_code)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.run()
          }}
        >
          <Field label={t('gov.wantedName')}>
            <Input name="wantedName" value={form.name} onChange={(e) => set('name')(e.target.value)} maxLength={100} required />
          </Field>
          <Field label={t('gov.wantedDesc')}>
            <Textarea value={form.description} onChange={(e) => set('description')(e.target.value)} maxLength={1000} rows={3} />
          </Field>
          <Field label={t('gov.reward')}>
            <Input type="number" min={0} value={form.reward} onChange={(e) => set('reward')(e.target.value)} />
          </Field>
          <Field label={t('gov.linkedUser')}>
            <Select value={form.linked} onChange={(e) => set('linked')(e.target.value)}>
              <option value="">—</option>
              {(profiles ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (@{p.login})
                </option>
              ))}
            </Select>
          </Field>
          {profile.role === 'superadmin' && (
            <Field label={t('gov.countryForAdmin')}>
              <CountrySelect value={form.country} onChange={set('country')} allowEmpty emptyLabel={t('common.planet')} />
            </Field>
          )}
          <ErrorBox error={create.error} />
          <Button type="submit" loading={create.pending}>
            {t('gov.publish')}
          </Button>
        </form>
      </Card>
      <div className="space-y-2">
        <ErrorBox error={toggle.error} />
        {mine.map((w) => (
          <div key={w.id} className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200/70">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{w.name}</span>
              {w.reward > 0 && <span className="block text-xs text-muted">{t('wanted.reward', { amount: coins(w.reward) })}</span>}
            </span>
            {!w.active && <Badge>off</Badge>}
            <Button variant="ghost" onClick={() => toggle.run({ id: w.id, active: !w.active })}>
              {w.active ? t('gov.deactivate') : t('gov.activate')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
