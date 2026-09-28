import { useState } from 'react'
import { ApplicationList } from '../../components/ApplicationList'
import { Empty, Loading, PageTitle, Tabs } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountryName, useStaffApplications } from '../../lib/queries'
import { GovElections } from './GovElections'
import { GovFines } from './GovFines'
import { GovNews } from './GovNews'
import { GovPeople } from './GovPeople'
import { GovSlots } from './GovSlots'
import { GovWanted } from './GovWanted'

function Queue() {
  const { t } = useI18n()
  const [onlyOpen, setOnlyOpen] = useState(true)
  const { data, isLoading } = useStaffApplications(onlyOpen)
  return (
    <>
      <label className="mb-4 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} className="h-4 w-4" />
        {t('gov.onlyOpen')}
      </label>
      {isLoading ? <Loading /> : data?.length ? <ApplicationList items={data} base="/gov/applications" showApplicant /> : <Empty>{t('gov.empty')}</Empty>}
    </>
  )
}

export function GovPage() {
  const { t, lang } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  const [tab, setTab] = useState('queue')
  if (!profile) return null
  const tabs = ['queue', 'slots', 'people', 'fines', 'news', 'elections', 'wanted'].map((v) => ({ value: v, label: t(`gov.${v}`) }))

  return (
    <>
      <PageTitle sub={profile.gov_country_code ? `${t(`roles.${profile.role}`)} · ${countryName(profile.gov_country_code, lang === 'psy')}` : t(`roles.${profile.role}`)}>
        {t('gov.title')}
      </PageTitle>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'queue' && <Queue />}
      {tab === 'slots' && <GovSlots />}
      {tab === 'people' && <GovPeople />}
      {tab === 'fines' && <GovFines />}
      {tab === 'news' && <GovNews />}
      {tab === 'elections' && <GovElections />}
      {tab === 'wanted' && <GovWanted />}
    </>
  )
}
