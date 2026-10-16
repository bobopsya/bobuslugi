import { FineStatusBadge } from '../../components/badges'
import { PdfButton } from '../../components/PdfButton'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { Alert, Button, Empty, ErrorBox, Loading } from '../../components/ui'
import { bankEnabled } from '../../lib/bank'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountryName, useProfileMap, useStaffFines } from '../../lib/queries'

export function GovFines() {
  const { t, coins, date, lang } = useI18n()
  const { profile } = useAuth()
  const { data, isLoading } = useStaffFines()
  const profileOf = useProfileMap()
  const countryName = useCountryName()
  const cancel = useAction((id: number) => callRpc('cancel_fine', { p_id: id }))
  const arrest = useAction(({ id, collect }: { id: number; collect: boolean }) => callRpc('request_arrest', { p_fine: id, p_collect: collect }))
  const ctx = usePdfCtx()
  if (isLoading) return <Loading />
  const list = (data ?? []).filter((f) => f.user_id !== profile?.id || profile.role === 'superadmin')
  if (!list.length) return <Empty />
  return (
    <>
      <ErrorBox error={cancel.error ?? arrest.error} />
      {arrest.done && <Alert tone="green">{t('gov.arrestSent')}</Alert>}
      <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
        {list.map((f) => (
          <div key={f.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black">{coins(f.amount)}</span>
                <FineStatusBadge status={f.status} />
                <span className="text-sm">{profileOf(f.user_id)?.display_name ?? '…'}</span>
              </div>
              <div className="text-sm text-muted">
                {t(`fineKind.${f.kind}`)}: {f.reason} · {f.country_code ? countryName(f.country_code, lang === 'psy') : t('common.planet')} · {date(f.created_at)}
              </div>
            </div>
            <PdfButton variant="ghost" label={t('pdf.fine')} make={async () => (await pdf()).finePdf(ctx, f)} />
            {f.status === 'unpaid' && bankEnabled && (
              <>
                <Button variant="secondary" onClick={() => confirm(t('common.confirm')) && arrest.run({ id: f.id, collect: false })}>
                  {t('gov.arrest')}
                </Button>
                <Button variant="secondary" onClick={() => confirm(t('common.confirm')) && arrest.run({ id: f.id, collect: true })}>
                  {t('gov.collect')}
                </Button>
              </>
            )}
            {f.status === 'unpaid' && (
              <Button variant="ghost" onClick={() => confirm(t('common.confirm')) && cancel.run(f.id)}>
                {t('gov.cancelFine')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
