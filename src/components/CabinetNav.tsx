import { NavLink } from 'react-router-dom'
import { useI18n } from '../lib/i18n'
import { cx } from './ui'

export function CabinetNav() {
  const { t } = useI18n()
  const items = [
    ['/cabinet', t('cabinet.profile')],
    ['/cabinet/documents', t('cabinet.documents')],
    ['/cabinet/applications', t('cabinet.applications')],
    ['/cabinet/fines', t('cabinet.fines')],
    ['/cabinet/wallet', t('cabinet.wallet')],
    ['/cabinet/notifications', t('cabinet.notifications')],
    ['/cabinet/settings', t('cabinet.settings')],
  ] as const
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
      {items.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cx('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold', isActive ? 'bg-brand-600 text-white' : 'text-muted hover:bg-brand-50')
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
