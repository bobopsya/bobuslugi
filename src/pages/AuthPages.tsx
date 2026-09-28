import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, ErrorBox, Field, Input } from '../components/ui'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <h1 className="mb-5 text-2xl font-black">{title}</h1>
        {children}
      </Card>
    </div>
  )
}

export function LoginPage() {
  const { t } = useI18n()
  const { signIn, session } = useAuth()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const next = params.get('next') || '/cabinet'
  if (session) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    try {
      await signIn(login, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title={t('auth.loginTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.login')}>
          <Input name="login" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </Field>
        <Field label={t('auth.password')}>
          <Input name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <ErrorBox error={error} />
        <Button type="submit" loading={pending} className="w-full">
          {t('auth.submitLogin')}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-bold text-brand-700 hover:underline">
          {t('nav.register')}
        </Link>
      </p>
    </AuthCard>
  )
}

export function RegisterPage() {
  const { t } = useI18n()
  const { signUp, session } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ login: '', displayName: '', password: '', password2: '', invite: '' })
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const inviteRequired = useQuery({
    queryKey: ['invite_required'],
    queryFn: async () => (await supabase.rpc('invite_required')).data as boolean,
  })

  if (session) return <Navigate to="/" replace />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.password.length < 6) return setError(new ApiError('E_PASSWORD'))
    if (form.password !== form.password2) return setError(new ApiError('E_PASSWORD_MISMATCH'))
    setPending(true)
    try {
      await signUp({ login: form.login.trim(), password: form.password, displayName: form.displayName, invite: form.invite.trim() || undefined })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <AuthCard title={t('auth.registerTitle')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('auth.login')} hint={t('auth.loginHint')}>
          <Input name="login" autoComplete="username" value={form.login} onChange={set('login')} pattern="[A-Za-z0-9_]{3,24}" required />
        </Field>
        <Field label={t('auth.displayName')}>
          <Input name="displayName" value={form.displayName} onChange={set('displayName')} maxLength={40} required />
        </Field>
        <Field label={t('auth.password')}>
          <Input name="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required />
        </Field>
        <Field label={t('auth.password2')}>
          <Input name="password2" type="password" autoComplete="new-password" value={form.password2} onChange={set('password2')} required />
        </Field>
        {inviteRequired.data && (
          <Field label={t('auth.invite')}>
            <Input name="invite" value={form.invite} onChange={set('invite')} required />
          </Field>
        )}
        <ErrorBox error={error} />
        <Button type="submit" loading={pending} className="w-full">
          {t('auth.submitRegister')}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-bold text-brand-700 hover:underline">
          {t('nav.login')}
        </Link>
      </p>
    </AuthCard>
  )
}
