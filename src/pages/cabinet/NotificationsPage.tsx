import { Link } from 'react-router-dom'
import { CabinetNav } from '../../components/CabinetNav'
import { Button, Empty, Loading, PageTitle, cx } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useI18n } from '../../lib/i18n'
import { notificationText } from '../../lib/notifications'
import { useNotifications } from '../../lib/queries'

export function NotificationsPage() {
  const { t, coins, num, date } = useI18n()
  const { data, isLoading } = useNotifications()
  const markAll = useAction(() => callRpc('mark_notifications_read', {}))
  const markOne = useAction((id: number) => callRpc('mark_notifications_read', { p_ids: [id] }))
  const unread = (data ?? []).some((n) => !n.read_at)

  return (
    <>
      <PageTitle>{t('cabinet.notifications')}</PageTitle>
      <CabinetNav />
      {unread && (
        <Button variant="secondary" className="mb-4" onClick={() => markAll.run()} loading={markAll.pending}>
          {t('notif.markAll')}
        </Button>
      )}
      {isLoading ? (
        <Loading />
      ) : data?.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
          {data.map((n) => {
            const body = (
              <>
                <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-accent-500')} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block', !n.read_at && 'font-bold')} data-testid="notification-text">
                    {notificationText(n, t, coins, num)}
                  </span>
                  <span className="block text-xs text-muted">{date(n.created_at, true)}</span>
                </span>
              </>
            )
            const onClick = () => !n.read_at && markOne.run(n.id)
            return n.link ? (
              <Link key={n.id} to={n.link} onClick={onClick} className="flex gap-3 p-4 hover:bg-brand-50/50">
                {body}
              </Link>
            ) : (
              <button key={n.id} onClick={onClick} className="flex w-full gap-3 p-4 text-left hover:bg-brand-50/50">
                {body}
              </button>
            )
          })}
        </div>
      ) : (
        <Empty>{t('notif.empty')}</Empty>
      )}
    </>
  )
}
