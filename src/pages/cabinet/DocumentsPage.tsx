import { CabinetNav } from '../../components/CabinetNav'
import { DocumentCard } from '../../components/DocumentCard'
import { PassportSpread } from '../../components/PassportSpread'
import { PdfButton } from '../../components/PdfButton'
import { ButtonLink, Empty, Loading, PageTitle } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useMyDocuments } from '../../lib/queries'
import { useQuery } from '@tanstack/react-query'
import { GPAY_URL, rub } from '../../lib/bank'
import { unwrap } from '../../lib/api'
import { supabase } from '../../lib/supabase'

type GpayShop = { shop_id: number; document_id: number; name: string; site: string | null; turnover_30d: number }

/** Shops in GPAY tied to this business: they appear here as soon as the merchant links them. */
function BusinessShops({ docId, shops }: { docId: number; shops: GpayShop[] }) {
  const mine = shops.filter((s) => s.document_id === docId)
  if (!GPAY_URL && !mine.length) return null
  return (
    <div className="mt-2 rounded-xl bg-white/10 p-3 text-sm">
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-white/70">Магазины GPAY</div>
      {mine.map((s) => (
        <div key={s.shop_id} className="flex justify-between gap-2">
          <span className="truncate">{s.name}{s.site ? ` · ${s.site}` : ''}</span>
          <span className="whitespace-nowrap font-bold" title="Оборот за 30 дней">{rub(Number(s.turnover_30d))}</span>
        </div>
      ))}
      {GPAY_URL && (
        <a className="mt-1 inline-block font-bold underline" href={`${GPAY_URL}/api/auth/gos/start?next=${encodeURIComponent(`/app/new?business=${docId}`)}`}>
          + Подключить магазин
        </a>
      )}
    </div>
  )
}

export function DocumentsPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const { data, isLoading } = useMyDocuments()
  const shops = useQuery({ queryKey: ['gpay-shops', profile?.id], enabled: Boolean(profile), queryFn: async () => unwrap(await supabase.from('gpay_shops').select('shop_id, document_id, name, site, turnover_30d')) as GpayShop[] })
  const sorted = [...(data ?? [])].sort((a, b) => Number(Boolean(a.revoked_at)) - Number(Boolean(b.revoked_at)))
  const passports = sorted.filter((d) => d.type === 'passport')
  const others = sorted.filter((d) => d.type !== 'passport')
  const download = (id: number) => async () => {
    const doc = sorted.find((d) => d.id === id)!
    await (await pdf()).documentPdf(ctx, doc, profile ?? undefined)
  }

  return (
    <>
      <PageTitle>{t('cabinet.documents')}</PageTitle>
      <CabinetNav />
      {isLoading ? (
        <Loading />
      ) : sorted.length ? (
        <div className="space-y-8">
          {passports.map((d) => (
            <div key={d.id} className="space-y-3">
              <PassportSpread doc={d} />
              <div className="text-center">
                <PdfButton make={download(d.id)} />
              </div>
            </div>
          ))}
          {others.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {others.map((d) => (
                <DocumentCard
                  key={d.id}
                  doc={d}
                  holder={profile ?? undefined}
                  action={
                    <>
                      <PdfButton make={download(d.id)} variant="secondary" />
                      {d.type === 'business_reg' && !d.revoked_at && <BusinessShops docId={d.id} shops={shops.data ?? []} />}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Empty>
          <p className="mb-4">{t('cabinet.noDocs')}</p>
          <ButtonLink to="/services/citizenship">{t('home.getCitizenship')}</ButtonLink>
        </Empty>
      )}
    </>
  )
}
