import { useState } from 'react'
import { CountrySelect } from '../../components/CountrySelect'
import { PdfButton } from '../../components/PdfButton'
import { Alert, Button, Card, cx, Empty, ErrorBox, Field, Input, Loading, SectionTitle } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useCountries, useCountryStats, useProfileMap, useProfiles, useTreasuryTx } from '../../lib/queries'
import type { Profile } from '../../lib/types'

function SalaryRow({ person, canEdit }: { person: Profile; canEdit: boolean }) {
  const { t, coins } = useI18n()
  const [value, setValue] = useState(String(person.salary))
  const save = useAction(() => callRpc('set_salary', { p_user: person.id, p_amount: Number(value) }))
  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{person.display_name}</span>
        <span className="block text-xs text-muted">
          {t(`roles.${person.role}`)} · {t('economy.salaryNow', { amount: coins(person.salary) })}
        </span>
      </span>
      {canEdit && (
        <>
          <div className="w-32">
            <Input type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} aria-label={t('economy.salary')} />
          </div>
          <Button variant="secondary" onClick={() => save.run()} loading={save.pending}>
            {save.done ? '✓' : t('common.save')}
          </Button>
        </>
      )}
      {save.error ? <ErrorBox error={save.error} /> : null}
    </div>
  )
}

/** Казна страны, население, зарплаты и налоги. */
export function GovTreasury() {
  const { t, coins, num, date } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const admin = profile?.role === 'superadmin'
  const president = profile?.role === 'president'
  const [picked, setPicked] = useState('BOBO')
  const country = admin ? picked : (profile?.gov_country_code ?? '')
  const canManage = admin || president

  const stats = useCountryStats()
  const countries = useCountries()
  const profiles = useProfiles()
  const ledger = useTreasuryTx(country)
  const profileOf = useProfileMap()
  const stat = stats.data?.find((s) => s.code === country)
  const c = countries.data?.find((x) => x.code === country)
  const staff = (profiles.data ?? []).filter((p) => p.gov_country_code === country && (p.role === 'official' || p.role === 'president'))
  const payroll = staff.filter((p) => p.salary > 0 && !p.banned)
  const payrollTotal = payroll.reduce((s, p) => s + p.salary, 0)

  const [customPop, setCustomPop] = useState('')
  const [topUp, setTopUp] = useState('')
  const [bizTax, setBizTax] = useState<string | null>(null)
  const [propTax, setPropTax] = useState<string | null>(null)
  const addPop = useAction((amount: number) => callRpc('add_population', { p_country: country, p_amount: amount }), () => setCustomPop(''))
  const pay = useAction(() => callRpc<{ ok: true; count: number; total: number }>('pay_salaries', { p_country: country }))
  const collect = useAction(() => callRpc<{ ok: true; count: number }>('collect_taxes', { p_country: country }))
  const saveTaxes = useAction(() =>
    callRpc('set_country_taxes', {
      p_country: country,
      p_business_tax: Number(bizTax ?? c?.business_tax ?? 0),
      p_property_tax: Number(propTax ?? c?.property_tax ?? 0),
    }),
  )
  const mint = useAction(() => callRpc('admin_treasury', { p_country: country, p_amount: Number(topUp) }), () => setTopUp(''))

  if (stats.isLoading || countries.isLoading) return <Loading />
  if (!country) return <Empty />

  return (
    <div className="space-y-6">
      {admin && (
        <div className="max-w-xs">
          <Field label={t('gov.countryForAdmin')}>
            <CountrySelect value={picked} onChange={setPicked} />
          </Field>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('economy.population')}</div>
          <div className="mt-1 text-4xl font-black text-brand-700" data-testid="population">
            {num(Number(stat?.population ?? 0))}
          </div>
          <div className="text-sm text-muted">{t('economy.players', { count: num(Number(stat?.players ?? 0)) })}</div>
          {canManage && (
            <div className="mt-4 space-y-2">
              <div className="flex flex-wrap gap-2">
                {[123, 1234, 4321].map((n) => (
                  <Button key={n} variant="secondary" onClick={() => addPop.run(n)} loading={addPop.pending}>
                    +{num(n)}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input type="number" value={customPop} onChange={(e) => setCustomPop(e.target.value)} placeholder={t('economy.customAmount')} />
                <Button onClick={() => addPop.run(Number(customPop))} disabled={!customPop} loading={addPop.pending}>
                  {t('economy.apply')}
                </Button>
              </div>
              <ErrorBox error={addPop.error} />
            </div>
          )}
        </Card>

        <Card>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('economy.treasury')}</div>
          <div className={cx('mt-1 text-4xl font-black', Number(stat?.treasury ?? 0) < 0 ? 'text-accent-500' : 'text-emerald-600')} data-testid="treasury">
            {coins(Number(stat?.treasury ?? 0))}
          </div>
          {Number(stat?.treasury ?? 0) < 0 && <div className="text-sm font-bold text-accent-500">{t('economy.deficit')}</div>}
          {admin && (
            <div className="mt-4 flex gap-2">
              <Input type="number" value={topUp} onChange={(e) => setTopUp(e.target.value)} placeholder={t('economy.topUp')} />
              <Button variant="secondary" onClick={() => mint.run()} disabled={!topUp} loading={mint.pending}>
                🖨 {t('economy.mint')}
              </Button>
            </div>
          )}
          <ErrorBox error={mint.error} />
        </Card>
      </div>

      <Card>
        <SectionTitle>{t('economy.salaries')}</SectionTitle>
        {staff.length ? (
          <div className="divide-y divide-slate-100">
            {staff.map((p) => (
              <SalaryRow key={`${p.id}-${p.salary}`} person={p} canEdit={canManage} />
            ))}
          </div>
        ) : (
          <Empty>{t('economy.noStaff')}</Empty>
        )}
        {canManage && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted">{t('economy.payrollTotal', { amount: coins(payrollTotal) })}</p>
            <ErrorBox error={pay.error} />
            {pay.done && <Alert tone="green">{t('economy.paid')}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => confirm(t('common.confirm')) && pay.run()} loading={pay.pending} disabled={!payrollTotal}>
                💸 {t('economy.paySalaries')}
              </Button>
              {payroll.length > 0 && c && (
                <PdfButton label={t('economy.payrollPdf')} make={async () => (await pdf()).payrollPdf(ctx, c, payroll)} />
              )}
            </div>
          </div>
        )}
      </Card>

      {canManage && c && (
        <Card className="space-y-3">
          <SectionTitle>{t('economy.taxes')}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('economy.businessTax')}>
              <Input type="number" min={0} value={bizTax ?? String(c.business_tax)} onChange={(e) => setBizTax(e.target.value)} />
            </Field>
            <Field label={t('economy.propertyTax')}>
              <Input type="number" min={0} value={propTax ?? String(c.property_tax)} onChange={(e) => setPropTax(e.target.value)} />
            </Field>
          </div>
          <ErrorBox error={saveTaxes.error ?? collect.error} />
          {collect.done && <Alert tone="green">{t('economy.collected')}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => saveTaxes.run()} loading={saveTaxes.pending}>
              {saveTaxes.done ? '✓' : t('common.save')}
            </Button>
            <Button onClick={() => confirm(t('economy.collectConfirm')) && collect.run()} loading={collect.pending}>
              🧾 {t('economy.collect')}
            </Button>
          </div>
        </Card>
      )}

      <div>
        <SectionTitle>{t('economy.ledger')}</SectionTitle>
        {ledger.isLoading ? (
          <Loading />
        ) : ledger.data?.length ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
            {ledger.data.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{t(`economy.tx.${tx.type}`)}</span>
                  <span className="block truncate text-xs text-muted">
                    {date(tx.created_at, true)}
                    {tx.type === 'salary'
                      ? ` · ${profileOf(tx.comment)?.display_name ?? ''}`
                      : (tx.type === 'fee' || tx.type === 'refund') && tx.comment
                        ? ` · ${t(`services.${tx.comment}.title`)}`
                        : tx.comment
                          ? ` · ${tx.comment}`
                          : ''}
                  </span>
                </span>
                <span className={cx('font-black', tx.delta > 0 ? 'text-emerald-600' : 'text-accent-500')}>
                  {tx.delta > 0 ? '+' : ''}
                  {coins(Number(tx.delta))}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{t('economy.noLedger')}</Empty>
        )}
      </div>
    </div>
  )
}
