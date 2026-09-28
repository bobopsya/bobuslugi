import { useI18n } from '../lib/i18n'
import { useCountries } from '../lib/queries'
import { Select } from './ui'

export function CountrySelect({ value, onChange, allowEmpty, emptyLabel, name }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean; emptyLabel?: string; name?: string }) {
  const { lang } = useI18n()
  const { data } = useCountries()
  return (
    <Select name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel ?? '—'}</option>}
      {(data ?? []).map((c) => (
        <option key={c.code} value={c.code}>
          {lang === 'psy' ? c.psy_name : c.name}
        </option>
      ))}
    </Select>
  )
}
