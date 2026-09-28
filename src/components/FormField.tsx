import { Field, Input, Select, Textarea } from './ui'
import { useI18n } from '../lib/i18n'
import { useCountries } from '../lib/queries'
import type { FieldDef } from '../lib/services'

export function FormField({
  field,
  value,
  onChange,
  cities,
}: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
  cities: string[]
}) {
  const { t, raw, lang } = useI18n()
  const { data: countries } = useCountries()
  const label = t(`fields.${field.label ?? field.name}`)
  const common = { name: field.name, value, required: field.required }

  let control: React.ReactNode
  if (field.kind === 'textarea') {
    control = <Textarea {...common} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
  } else if (field.kind === 'select') {
    const opts = raw<string[]>(`options.${field.optionsKey}`) ?? []
    control = (
      <Select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    )
  } else if (field.kind === 'country') {
    control = (
      <Select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(countries ?? []).map((c) => (
          <option key={c.code} value={lang === 'psy' ? c.psy_name : c.name}>
            {lang === 'psy' ? c.psy_name : c.name}
          </option>
        ))}
      </Select>
    )
  } else if (field.kind === 'city' && cities.length) {
    control = (
      <Select {...common} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {cities.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>
    )
  } else {
    control = <Input {...common} maxLength={200} onChange={(e) => onChange(e.target.value)} />
  }
  return <Field label={label}>{control}</Field>
}

