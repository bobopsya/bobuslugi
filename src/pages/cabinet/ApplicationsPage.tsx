import { ApplicationList } from '../../components/ApplicationList'
import { CabinetNav } from '../../components/CabinetNav'
import { Empty, Loading, PageTitle } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { useMyApplications } from '../../lib/queries'

export function ApplicationsPage() {
  const { t } = useI18n()
  const { data, isLoading } = useMyApplications()
  return (
    <>
      <PageTitle>{t('cabinet.applications')}</PageTitle>
      <CabinetNav />
      {isLoading ? <Loading /> : data?.length ? <ApplicationList items={data} base="/cabinet/applications" /> : <Empty>{t('cabinet.noApps')}</Empty>}
    </>
  )
}
