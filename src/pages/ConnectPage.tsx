import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, ErrorBox, PageTitle } from '../components/ui'
import { callRpc } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CLIENTS } from '../lib/bank'

/**
 * «Войти через Бобуслуги»: Bobobank or GPAY asks for the citizen's data. The code goes back only to the
 * address configured for that client, so a link with someone else's address cannot steal it.
 */
export function ConnectPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const client = CLIENTS[params.get('client') ?? '']
  const state = params.get('state') ?? ''
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!client?.url || !state) {
    return (
      <>
        <PageTitle>Подключение сервиса</PageTitle>
        <Alert tone="red">Ссылка неполная или сервис не подключён к Бобуслугам. Вернитесь в банк и попробуйте ещё раз.</Alert>
      </>
    )
  }
  const allow = async () => {
    setBusy(true)
    setError(null)
    try {
      const r = await callRpc<{ ok: true; code: string }>('create_link_code', { p_client: params.get('client') })
      window.location.assign(`${client.url}/api/auth/gos/callback?code=${encodeURIComponent(r.code)}&state=${encodeURIComponent(state)}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }
  return (
    <div className="mx-auto max-w-lg">
      <PageTitle sub={`Вы вошли как ${profile?.display_name} (@${profile?.login})`}>Вход в {client.name} через Бобуслуги</PageTitle>
      <Card className="space-y-4">
        <p>
          <b>{client.name}</b> получит:
        </p>
        <ul className="list-inside list-disc space-y-1 text-sm">
          {client.scope.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="text-sm text-muted">Пароль от Бобуслуг сервис не узнает. Код входа одноразовый и действует 5 минут.</p>
        <ErrorBox error={error} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void allow()} loading={busy} data-testid="connect-allow">
            Разрешить и продолжить
          </Button>
          <Button variant="ghost" onClick={() => (window.history.length > 1 ? window.history.back() : nav('/cabinet'))}>
            Отмена
          </Button>
        </div>
      </Card>
    </div>
  )
}
