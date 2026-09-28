import { useState } from 'react'
import { Card, Field, PageTitle, Select } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { DICTIONARY, LORE_DATE, LORE_NUMBERS, psyAdd } from '../lib/lore'

function PsyCalc() {
  const { t } = useI18n()
  const [a, setA] = useState<number>(123)
  const [b, setB] = useState<number>(123)
  return (
    <Card>
      <h2 className="mb-3 text-lg font-black">{t('lore.calc')}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="A">
          <Select value={a} onChange={(e) => setA(Number(e.target.value))} className="w-28">
            {LORE_NUMBERS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <span className="pb-3 text-2xl font-black">+</span>
        <Field label="B">
          <Select value={b} onChange={(e) => setB(Number(e.target.value))} className="w-28">
            {LORE_NUMBERS.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <span className="pb-3 text-2xl font-black">=</span>
        <div className="pb-2">
          <div className="text-xs text-muted">{t('lore.calcResult')}</div>
          <div className="text-3xl font-black text-brand-700" data-testid="psy-result">
            {psyAdd(a, b)}
          </div>
        </div>
      </div>
    </Card>
  )
}

export function LorePage() {
  const { t, raw } = useI18n()
  const terms = raw<[string, string][]>('lore.termList') ?? []
  return (
    <>
      <PageTitle>{t('lore.title')}</PageTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-black">{t('lore.planet')}</h2>
          <p>{t('lore.planetText')}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-black">{t('lore.time')}</h2>
          <div className="text-4xl font-black text-brand-700">{LORE_DATE}</div>
          <p className="mt-2">{t('lore.timeText')}</p>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-black">{t('lore.numbers')}</h2>
          <p>{t('lore.numbersText')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LORE_NUMBERS.map((n) => (
              <span key={n} className="rounded-lg bg-brand-50 px-3 py-1 font-mono font-bold text-brand-700">
                {n}
              </span>
            ))}
          </div>
        </Card>
        <PsyCalc />
        <Card>
          <h2 className="mb-2 text-lg font-black">{t('lore.language')}</h2>
          <p>{t('lore.languageText')}</p>
          <h3 className="mb-2 mt-4 font-black">{t('lore.dictionary')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-4">{t('lore.psy')}</th>
                <th className="py-1">{t('lore.ru')}</th>
              </tr>
            </thead>
            <tbody>
              {DICTIONARY.map((w) => (
                <tr key={w.psy} className="border-t border-slate-100">
                  <td className="py-1.5 pr-4 font-bold">{w.psy}</td>
                  <td className="py-1.5">{w.ru}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-lg font-black">{t('lore.forbidden')}</h2>
            <p>{t('lore.forbiddenText')}</p>
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-black">{t('lore.terms')}</h2>
            <dl className="space-y-3">
              {terms.map(([term, def]) => (
                <div key={term}>
                  <dt className="font-bold">{term}</dt>
                  <dd className="text-sm text-muted">{def}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
