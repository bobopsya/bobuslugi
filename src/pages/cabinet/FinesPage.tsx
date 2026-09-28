import { useState } from 'react'
import { FineStatusBadge } from '../../components/badges'
import { CabinetNav } from '../../components/CabinetNav'
import { PdfButton } from '../../components/PdfButton'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { Button, Empty, ErrorBox, Loading, PageTitle } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { useCountryName, useMyFines } from '../../lib/queries'

export function FinesPage() {
  const { t, coins, date, lang } = useI18n()
  const { data, isLoading } = useMyFines()
  const countryName = useCountryName()
  const [payingId, setPayingId] = useState<number | null>(null)
  const pay = useAction((id: number) => callRpc('pay_fine', { p_id: id }))
  const ctx = usePdfCtx()

  return (
    <>
      <PageTitle>{t('cabinet.fines')}</PageTitle>
      <CabinetNav />
      <ErrorBox error={pay.error} />
      {isLoading ? (
        <Loading />
      ) : data?.length ? (
        <div className="mt-3 space-y-3">
          {data.map((f) => (
            <div key={f.id} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:flex-row sm:items-center" data-testid="fine-row">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black">{coins(f.amount)}</span>
                  <FineStatusBadge status={f.status} />
                </div>
                <div className="mt-1 text-sm">
                  {t(`fineKind.${f.kind}`)}: {f.reason}
                </div>
                <div className="text-xs text-muted">
                  {f.country_code ? countryName(f.country_code, lang === 'psy') : t('common.planet')} · {date(f.created_at)}
                </div>
              </div>
              <PdfButton variant="ghost" label={t('pdf.fine')} make={async () => (await pdf()).finePdf(ctx, f)} />
              {f.status === 'unpaid' && (
                <Button
                  loading={pay.pending && payingId === f.id}
                  onClick={() => {
                    setPayingId(f.id)
                    pay.run(f.id)
                  }}
                >
                  {t('cabinet.pay')}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty>{t('cabinet.noFines')}</Empty>
      )}
    </>
  )
}
