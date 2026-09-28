import { CabinetNav } from '../../components/CabinetNav'
import { DocumentCard } from '../../components/DocumentCard'
import { ButtonLink, Empty, Loading, PageTitle } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useMyDocuments } from '../../lib/queries'

export function DocumentsPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const { data, isLoading } = useMyDocuments()
  const sorted = [...(data ?? [])].sort((a, b) => Number(Boolean(a.revoked_at)) - Number(Boolean(b.revoked_at)))
  return (
    <>
      <PageTitle>{t('cabinet.documents')}</PageTitle>
      <CabinetNav />
      {isLoading ? (
        <Loading />
      ) : sorted.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {sorted.map((d) => (
            <DocumentCard key={d.id} doc={d} holder={profile ?? undefined} />
          ))}
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
