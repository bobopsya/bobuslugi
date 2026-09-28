import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Button, ErrorBox } from './ui'

/** Кнопка «Скачать PDF»: генерирует документ в браузере. */
export function PdfButton({ make, label, variant = 'secondary' }: { make: () => Promise<void>; label?: string; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const { t } = useI18n()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        loading={pending}
        onClick={async () => {
          setPending(true)
          setError(null)
          try {
            await make()
          } catch (e) {
            setError(e)
          } finally {
            setPending(false)
          }
        }}
      >
        📄 {label ?? t('pdf.download')}
      </Button>
      {error ? <ErrorBox error={error} /> : null}
    </span>
  )
}
