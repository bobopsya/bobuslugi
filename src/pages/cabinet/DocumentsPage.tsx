import { CabinetNav } from '../../components/CabinetNav'
import { DocumentCard } from '../../components/DocumentCard'
import { PassportSpread } from '../../components/PassportSpread'
import { PdfButton } from '../../components/PdfButton'
import { ButtonLink, Empty, Loading, PageTitle } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useMyDocuments } from '../../lib/queries'

export function DocumentsPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const { data, isLoading } = useMyDocuments()
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
                <DocumentCard key={d.id} doc={d} holder={profile ?? undefined} action={<PdfButton make={download(d.id)} variant="ghost" />} />
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
