import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import { errorText } from '../lib/api'
import { useI18n } from '../lib/i18n'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-200',
  secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:opacity-50',
  danger: 'bg-accent-500 text-white hover:brightness-95 disabled:opacity-50',
  ghost: 'text-brand-700 hover:bg-brand-50 disabled:opacity-50',
}

export function Button({
  variant = 'primary',
  className,
  loading,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed',
        variants[variant],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  )
}

export function ButtonLink({ to, variant = 'primary', className, children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors', variants[variant], className)}
    >
      {children}
    </Link>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, props.className)} />
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={cx(inputCls, props.className)} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, props.className)} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6', className)}>{children}</div>
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-black text-ink sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-black text-ink">{children}</h2>
      {action}
    </div>
  )
}

type Tone = 'blue' | 'green' | 'red' | 'yellow' | 'gray'
const tones: Record<Tone, string> = {
  blue: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-rose-50 text-rose-700',
  yellow: 'bg-amber-50 text-amber-800',
  gray: 'bg-slate-100 text-slate-600',
}

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone])}>{children}</span>
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={cx('inline-block animate-spin rounded-full border-2 border-current border-t-transparent', small ? 'h-4 w-4' : 'h-6 w-6')}
      aria-hidden
    />
  )
}

export function Loading() {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3 py-10 text-muted">
      <Spinner /> {t('common.loading')}
    </div>
  )
}

export function Empty({ children }: { children?: ReactNode }) {
  const { t } = useI18n()
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-muted">{children ?? t('common.empty')}</div>
}

export function Alert({ tone = 'blue', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={cx('rounded-xl px-4 py-3 text-sm', tones[tone])}>{children}</div>
}

export function ErrorBox({ error }: { error: unknown }) {
  const { t } = useI18n()
  if (!error) return null
  return (
    <Alert tone="red">
      <span role="alert">{errorText(error, t)}</span>
    </Alert>
  )
}

export function Tabs({ items, value, onChange }: { items: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 ring-1 ring-slate-200">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold',
            value === it.value ? 'bg-brand-600 text-white' : 'text-muted hover:bg-brand-50',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:gap-4">
      <div className="text-sm text-muted sm:w-48 sm:shrink-0">{label}</div>
      <div className="min-w-0 break-words font-bold">{children}</div>
    </div>
  )
}
