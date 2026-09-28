import { useQuery } from '@tanstack/react-query'
import { unwrap } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { Slot } from '../lib/types'
import { cx, Empty, Loading } from './ui'

export function useFreeSlots(country: string | null) {
  return useQuery({
    queryKey: ['slots', 'free', country],
    enabled: Boolean(country),
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('appointment_slots')
          .select('*')
          .eq('country_code', country!)
          .is('application_id', null)
          .gt('starts_at', new Date().toISOString())
          .order('starts_at')
          .limit(200),
      ) as Slot[],
  })
}

/** Выбор свободного времени приёма, сгруппированного по дням. */
export function SlotPicker({ country, value, onChange }: { country: string | null; value: number | null; onChange: (id: number) => void }) {
  const { t, date } = useI18n()
  const { data, isLoading } = useFreeSlots(country)
  if (!country) return <Empty>{t('catalog.chooseCountry')}</Empty>
  if (isLoading) return <Loading />
  if (!data?.length) return <Empty>{t('docflow.noSlots')}</Empty>

  const days = new Map<string, Slot[]>()
  for (const s of data) {
    const key = new Date(s.starts_at).toDateString()
    days.set(key, [...(days.get(key) ?? []), s])
  }

  return (
    <div className="space-y-4">
      {[...days.values()].map((slots) => (
        <div key={slots[0].id}>
          <div className="mb-2 text-sm font-bold text-muted">{date(slots[0].starts_at)}</div>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                data-testid="slot"
                onClick={() => onChange(s.id)}
                className={cx(
                  'rounded-lg px-3 py-2 text-left text-sm ring-1',
                  value === s.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-300 hover:ring-brand-400',
                )}
              >
                <span className="block font-bold">
                  {new Date(s.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={cx('block text-xs', value === s.id ? 'text-white/80' : 'text-muted')}>{s.place}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
