import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CountrySelect } from '../../components/CountrySelect'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useStaffSlots } from '../../lib/queries'

function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Расписание приёма: чиновник публикует слоты, в которые граждане приходят в Гармод. */
export function GovSlots() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const admin = profile?.role === 'superadmin'
  const [country, setCountry] = useState('BOBO')
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 3600_000)
    d.setMinutes(0, 0, 0)
    return localInputValue(d)
  })
  const [count, setCount] = useState('4')
  const [interval, setIntervalMin] = useState('15')
  const [place, setPlace] = useState('')
  const slots = useStaffSlots(admin ? null : profile?.gov_country_code)

  const create = useAction(() =>
    callRpc('create_slots', {
      p_starts_at: new Date(startsAt).toISOString(),
      p_count: Number(count),
      p_interval_minutes: Number(interval),
      p_place: place,
      p_country: admin ? country : null,
    }),
  )
  const remove = useAction((id: number) => callRpc('delete_slot', { p_id: id }))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-black">{t('docflow.slotsTitle')}</h2>
        <p className="mb-4 text-sm text-muted">{t('docflow.slotsHint')}</p>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            create.run()
          }}
        >
          {admin && (
            <Field label={t('gov.countryForAdmin')}>
              <CountrySelect value={country} onChange={setCountry} />
            </Field>
          )}
          <Field label={t('docflow.slotStart')}>
            <Input name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('docflow.slotCount')}>
              <Input name="count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} required />
            </Field>
            <Field label={t('docflow.slotInterval')}>
              <Input name="interval" type="number" min={1} max={1440} value={interval} onChange={(e) => setIntervalMin(e.target.value)} required />
            </Field>
          </div>
          <Field label={t('docflow.slotPlace')} hint={t('docflow.slotPlaceHint')}>
            <Input name="place" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} required />
          </Field>
          <ErrorBox error={create.error} />
          <Button type="submit" loading={create.pending}>
            {t('docflow.publishSlots')}
          </Button>
        </form>
      </Card>

      <div>
        <ErrorBox error={remove.error} />
        {slots.isLoading ? (
          <Loading />
        ) : slots.data?.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
            {slots.data.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-3" data-testid="staff-slot">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">
                    {new Date(s.starts_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <span className="block truncate text-xs text-muted">{s.place}</span>
                </span>
                {s.application_id ? (
                  <Link to={`/gov/applications/${s.application_id}`}>
                    <Badge tone="green">
                      {t('docflow.slotBooked')} №{s.application_id}
                    </Badge>
                  </Link>
                ) : (
                  <>
                    <Badge>{t('docflow.slotFree')}</Badge>
                    <Button variant="ghost" onClick={() => remove.run(s.id)}>
                      ✕
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t('docflow.noSlotsStaff')}</Empty>
        )}
      </div>
    </div>
  )
}
