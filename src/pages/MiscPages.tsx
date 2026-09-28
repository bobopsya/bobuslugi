import { ButtonLink } from '../components/ui'
import { useI18n } from '../lib/i18n'

export function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="py-16 text-center">
      <div className="mb-4 text-6xl" aria-hidden>
        🌀
      </div>
      <h1 className="text-2xl font-black">{t('notFound.title')}</h1>
      <p className="mt-2 text-muted">{t('notFound.text')}</p>
      <ButtonLink to="/" className="mt-6">
        {t('notFound.home')}
      </ButtonLink>
    </div>
  )
}

export function SetupPage() {
  const { t } = useI18n()
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-2xl font-black text-brand-700">{t('setup.title')}</h1>
      <p className="mt-3 text-muted">{t('setup.text')}</p>
    </div>
  )
}
