import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CabinetNav } from '../../components/CabinetNav'
import { Alert, Button, Card, Empty, ErrorBox, Loading, PageTitle, SectionTitle, Select } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { BANK_URL, bankApi, bankEnabled, GPAY_URL, rub, type BankIncome, type BankStatement, type BankSummary } from '../../lib/bank'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'

const PERIODS = [
  { value: '30', label: 'За 30 дней' },
  { value: '90', label: 'За 3 месяца' },
  { value: '365', label: 'За год' },
]

/** Cabinet → Банк: accounts in Bobobank, statements and income certificates as state-style PDFs. */
export function BankPage() {
  const { coins } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const summary = useQuery({ queryKey: ['bank-summary'], queryFn: () => bankApi<BankSummary>('/summary'), enabled: bankEnabled, retry: false })
  const [account, setAccount] = useState('')
  const [days, setDays] = useState('30')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(null)
    }
  }

  if (!bankEnabled) {
    return (
      <>
        <PageTitle>Банк</PageTitle>
        <CabinetNav />
        <Empty>Bobobank пока не подключён к Бобуслугам.</Empty>
      </>
    )
  }
  const s = summary.data
  const acc = account || s?.accounts?.[0]?.id || ''
  return (
    <>
      <PageTitle sub="Bobobank — банк Бобосоюза">Банк</PageTitle>
      <CabinetNav />
      <ErrorBox error={summary.error ?? error} />
      {summary.isLoading ? (
        <Loading />
      ) : !s?.linked ? (
        <Card className="space-y-3">
          <SectionTitle>Счёта в Bobobank пока нет</SectionTitle>
          <p className="text-sm text-muted">Откройте счёт по Бобопаспорту: банк возьмёт ваши данные с Бобуслуг. После этого здесь появятся счета, выписки и справки, а штрафы можно будет оплачивать рублями.</p>
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700" href={`${BANK_URL}/api/auth/gos/start?next=/app`}>
              Открыть счёт в Bobobank
            </a>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-black">{s.client?.name}</div>
                <div className="text-sm text-muted">Клиент Bobobank · {s.client?.phone}</div>
              </div>
              <a className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100" href={`${BANK_URL}/app`}>
                Открыть банк
              </a>
              <a className="rounded-lg bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100" href={`${BANK_URL}/app/exchange/psy`}>
                Обменять псякоины
              </a>
            </div>
            <p className="mt-3 text-sm text-muted">На Бобуслугах у вас {coins(profile?.balance ?? 0)}. Псякоины можно продать за рубли и купить обратно в банке по курсу.</p>
          </Card>

          <div>
            <SectionTitle>Счета</SectionTitle>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
              {s.accounts?.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{a.name}</span>
                    <span className="block font-mono text-xs text-muted">{a.number}</span>
                  </span>
                  <span className="font-black">{a.currency === 'RUB' ? rub(a.balance) : `${(a.balance / 100).toFixed(2)} ${a.currency}`}</span>
                </div>
              ))}
            </div>
          </div>

          <Card className="space-y-3">
            <SectionTitle>Выписки и справки</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select value={acc} onChange={(e) => setAccount(e.target.value)} aria-label="Счёт">
                {s.accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ·· {a.number.slice(-4)}
                  </option>
                ))}
              </Select>
              <Select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Период">
                {PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={busy === 'st'}
                disabled={!acc}
                onClick={() =>
                  void run('st', async () => {
                    const to = Date.now()
                    const st = await bankApi<BankStatement>(`/statement?account=${acc}&from=${to - Number(days) * 86400_000}&to=${to}`)
                    await (await pdf()).bankStatementPdf(ctx, profile!, st)
                  })
                }
              >
                📄 Выписка по счёту
              </Button>
              <Button
                variant="secondary"
                loading={busy === 'inc'}
                onClick={() =>
                  void run('inc', async () => {
                    const inc = await bankApi<BankIncome>('/income?months=12')
                    await (await pdf()).incomeCertificatePdf(ctx, profile!, inc)
                  })
                }
              >
                🧾 Справка о доходах за год
              </Button>
            </div>
            <p className="text-xs text-muted">Документы формирует банк, на Бобуслугах они не хранятся.</p>
          </Card>
          {GPAY_URL && (
            <Alert tone="blue">
              Принимаете оплату? Подключите магазин в <a className="font-bold underline" href={`${GPAY_URL}/api/auth/gos/start?next=/app/new`}>GPAY через Бобуслуги</a> — реквизиты бизнеса подставятся из реестра.
            </Alert>
          )}
        </div>
      )}
    </>
  )
}
