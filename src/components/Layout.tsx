import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { isStaff, useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useNotifications } from '../lib/queries'
import { cx, Loading } from './ui'

export function Logo() {
  const { t } = useI18n()
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label={t('app.name')}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden>
        <circle cx="20" cy="20" r="20" className="fill-brand-600" />
        <circle cx="20" cy="20" r="13" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="4 3" />
        <text x="20" y="26" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" fontFamily="Lato, sans-serif">
          Б
        </text>
      </svg>
      <span className="leading-tight">
        <span className="block text-xl font-black tracking-tight text-brand-600">
          бобо<span className="text-accent-500">услуги</span>
        </span>
        <span className="hidden text-[11px] text-muted 2xl:block">{t('app.tagline')}</span>
      </span>
    </Link>
  )
}

function LangToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold" role="group" aria-label={t('lang.switch')}>
      {(['ru', 'psy'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cx('rounded-md px-2 py-1', lang === l ? 'bg-white text-brand-700 shadow-sm' : 'text-muted')}
        >
          {t(`lang.${l}`)}
        </button>
      ))}
    </div>
  )
}

function Bell() {
  const { t } = useI18n()
  const { data } = useNotifications()
  const unread = (data ?? []).filter((n) => !n.read_at).length
  return (
    <Link to="/cabinet/notifications" className="relative rounded-lg p-2 hover:bg-brand-50" aria-label={t('nav.notifications')}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-brand-700" strokeWidth="2" aria-hidden>
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && (
        <span data-testid="unread-count" className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-accent-500 px-1 text-center text-[11px] font-bold leading-5 text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}

export function Layout() {
  const { t, coins } = useI18n()
  const { profile, session, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const qc = useQueryClient()

  // Профиль (баланс, гражданство, роль) может поменять другой человек — перечитываем его при каждом переходе.
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['profile'] })
  }, [location.pathname, qc])

  const links = [
    { to: '/services', label: t('nav.services') },
    { to: '/news', label: t('nav.news') },
    { to: '/elections', label: t('nav.elections') },
    { to: '/wanted', label: t('nav.wanted') },
    { to: '/countries', label: t('nav.countries') },
    { to: '/lore', label: t('nav.lore') },
  ]
  if (isStaff(profile)) links.push({ to: '/gov', label: t('nav.gov') })
  if (profile?.role === 'superadmin') links.push({ to: '/admin', label: t('nav.admin') })

  const navCls = ({ isActive }: { isActive: boolean }) =>
    cx('whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-bold', isActive ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-slate-50')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo />
          <nav className="ml-2 hidden flex-1 items-center xl:flex">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navCls}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            {session && <Bell />}
            {profile ? (
              <Link to="/cabinet" className="hidden items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-brand-50 sm:flex">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-sm font-black text-white">
                  {profile.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="text-left leading-tight">
                  <span className="block max-w-32 truncate text-sm font-bold">{profile.display_name}</span>
                  <span className="block text-xs text-muted" data-testid="header-balance">
                    {coins(profile.balance)}
                  </span>
                </span>
              </Link>
            ) : (
              !session && (
                <Link to="/login" className="hidden rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700 sm:block">
                  {t('nav.login')}
                </Link>
              )
            )}
            <button className="rounded-lg p-2 hover:bg-slate-100 xl:hidden" onClick={() => setOpen((o) => !o)} aria-label={t('nav.menu')} aria-expanded={open}>
              <svg viewBox="0 0 24 24" className="h-6 w-6 stroke-ink" strokeWidth="2" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-slate-200 px-4 py-2 xl:hidden" onClick={() => setOpen(false)}>
            <div className="mx-auto flex max-w-6xl flex-col">
              {links.map((l) => (
                <NavLink key={l.to} to={l.to} className={navCls}>
                  {l.label}
                </NavLink>
              ))}
              {profile ? (
                <>
                  <NavLink to="/cabinet" className={navCls}>
                    {t('nav.cabinet')} · {coins(profile.balance)}
                  </NavLink>
                  <button onClick={signOut} className="rounded-lg px-3 py-2 text-left text-sm font-bold text-accent-500">
                    {t('nav.logout')}
                  </button>
                </>
              ) : (
                <NavLink to="/login" className={navCls}>
                  {t('nav.login')}
                </NavLink>
              )}
            </div>
          </nav>
        )}
      </header>

      <main key={location.pathname} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>{t('app.footer')}</span>
          {profile && (
            <button onClick={signOut} className="self-start font-bold text-brand-700 hover:underline sm:self-auto">
              {t('nav.logout')}
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

/** Страница только для вошедших. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!profile) return <Loading />
  return <>{children}</>
}

export function RequireRole({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { profile } = useAuth()
  const { t } = useI18n()
  const ok = admin ? profile?.role === 'superadmin' : isStaff(profile)
  if (!ok) return <div className="py-10 text-center text-muted">{t('gov.noAccess')}</div>
  return <>{children}</>
}
