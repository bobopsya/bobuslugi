import { useI18n } from '../lib/i18n'
import type { AppStatus, ElectionStatus, FineStatus } from '../lib/types'
import { Badge } from './ui'

const appTone = { submitted: 'blue', needs_info: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray' } as const

export function AppStatusBadge({ status }: { status: AppStatus }) {
  const { t } = useI18n()
  return <Badge tone={appTone[status]}>{t(`appStatus.${status}`)}</Badge>
}

const fineTone = { unpaid: 'red', paid: 'green', cancelled: 'gray' } as const

export function FineStatusBadge({ status }: { status: FineStatus }) {
  const { t } = useI18n()
  return <Badge tone={fineTone[status]}>{t(`fineStatus.${status}`)}</Badge>
}

const electionTone = { draft: 'gray', open: 'green', closed: 'blue' } as const

export function ElectionStatusBadge({ status }: { status: ElectionStatus }) {
  const { t } = useI18n()
  return <Badge tone={electionTone[status]}>{t(`electionStatus.${status}`)}</Badge>
}
