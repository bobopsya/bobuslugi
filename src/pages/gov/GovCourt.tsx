import { Loading } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useLawsuits } from '../../lib/queries'
import { LawsuitList } from '../CourtPage'

/** Дела страны, которые рассматривает госслужащий. */
export function GovCourt() {
  const { profile } = useAuth()
  const { data, isLoading } = useLawsuits()
  if (isLoading) return <Loading />
  const items = (data ?? []).filter((s) => profile?.role === 'superadmin' || s.country_code === profile?.gov_country_code)
  return <LawsuitList items={items} />
}
