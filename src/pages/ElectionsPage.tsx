import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ElectionStatusBadge } from '../components/badges'
import { PdfButton } from '../components/PdfButton'
import { pdf, usePdfCtx } from '../lib/pdf/usePdf'
import { Alert, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageTitle, Select, Textarea } from '../components/ui'
import { callRpc, useAction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountryName, useElection, useElections, useProfiles } from '../lib/queries'
import { NotFoundPage } from './MiscPages'

export function ElectionsPage() {
  const { t, date, lang } = useI18n()
  const { data, isLoading } = useElections()
  const countryName = useCountryName()
  return (
    <>
      <PageTitle>{t('elections.title')}</PageTitle>
      {isLoading ? (
        <Loading />
      ) : data?.length ? (
        <div className="space-y-3">
          {data.map((e) => (
            <Link key={e.id} to={`/elections/${e.id}`} className="flex items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 hover:ring-brand-200">
              <span className="text-3xl" aria-hidden>
                🗳️
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-black">{e.title}</span>
                <span className="block text-sm text-muted">
                  {countryName(e.country_code, lang === 'psy')} · {date(e.created_at)}
                </span>
              </span>
              <ElectionStatusBadge status={e.status} />
            </Link>
          ))}
        </div>
      ) : (
        <Empty>{t('elections.empty')}</Empty>
      )}
    </>
  )
}

function CandidateForm({ electionId, country }: { electionId: number; country: string }) {
  const { t } = useI18n()
  const { data: profiles } = useProfiles()
  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')
  const [program, setProgram] = useState('')
  const add = useAction(
    () => callRpc('add_candidate', { p_election: electionId, p_user: userId || null, p_name: name || null, p_program: program }),
    () => {
      setUserId('')
      setName('')
      setProgram('')
    },
  )
  const citizens = (profiles ?? []).filter((p) => p.country_code === country)
  return (
    <Card>
      <h2 className="mb-3 font-black">{t('gov.addCandidate')}</h2>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          add.run()
        }}
      >
        <Field label={t('gov.candidateUser')}>
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">—</option>
            {citizens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (@{p.login})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('gov.candidateName')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        </Field>
        <Field label={t('gov.program')}>
          <Textarea value={program} onChange={(e) => setProgram(e.target.value)} maxLength={1000} rows={3} />
        </Field>
        <ErrorBox error={add.error} />
        <Button type="submit" loading={add.pending}>
          {t('gov.addCandidate')}
        </Button>
      </form>
    </Card>
  )
}

export function ElectionPage() {
  const { id } = useParams()
  const electionId = Number(id)
  const { t, num, lang, date } = useI18n()
  const { profile } = useAuth()
  const countryName = useCountryName()
  const { data, isLoading } = useElection(electionId)
  const vote = useAction((candidate: number) => callRpc('vote', { p_election: electionId, p_candidate: candidate }))
  const setStatus = useAction((status: 'open' | 'closed') => callRpc('set_election_status', { p_id: electionId, p_status: status }))
  const remove = useAction((cid: number) => callRpc('remove_candidate', { p_id: cid }))
  const ctx = usePdfCtx()

  if (isLoading) return <Loading />
  if (!data?.election) return <NotFoundPage />
  const { election, candidates, myVote, results, turnout } = data
  const canManage =
    profile && (profile.role === 'superadmin' || (profile.role === 'president' && profile.gov_country_code === election.country_code))
  const canVote = profile && election.status === 'open' && profile.country_code === election.country_code && myVote == null
  const votesOf = (cid: number) => results?.find((r) => r.candidate_id === cid)?.votes ?? 0
  const total = results?.reduce((s, r) => s + Number(r.votes), 0) ?? 0
  const winner = election.status === 'closed' && results?.length ? results[0].candidate_id : null

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/elections" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('elections.title')}
      </Link>
      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <ElectionStatusBadge status={election.status} />
          <span className="text-sm text-muted">
            {countryName(election.country_code, lang === 'psy')} · {date(election.created_at)}
          </span>
        </div>
        <h1 className="text-2xl font-black">{election.title}</h1>
        {election.description && <p className="mt-2 whitespace-pre-wrap text-muted">{election.description}</p>}
        {turnout != null && election.status !== 'draft' && <p className="mt-2 text-sm font-bold">{t('elections.turnout', { count: num(turnout) })}</p>}
        {election.status === 'closed' && results && (
          <div className="mt-3">
            <PdfButton
              label={t('pdf.protocol')}
              make={async () => (await pdf()).electionProtocolPdf(ctx, election, candidates, results, Number(turnout ?? 0))}
            />
          </div>
        )}
      </Card>

      {profile && election.status === 'open' && profile.country_code !== election.country_code && (
        <Alert tone="yellow">{t('elections.onlyCitizens', { country: countryName(election.country_code, lang === 'psy') })}</Alert>
      )}
      {myVote != null && <Alert tone="green">{t('elections.voted')}</Alert>}
      <ErrorBox error={vote.error ?? setStatus.error ?? remove.error} />

      <div className="grid gap-3 sm:grid-cols-2">
        {candidates.map((c) => {
          const v = Number(votesOf(c.id))
          const pct = total ? Math.round((v / total) * 100) : 0
          return (
            <Card key={c.id} className={c.id === winner ? 'ring-2 ring-emerald-400' : c.id === myVote ? 'ring-2 ring-brand-400' : ''}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-lg font-black">{c.name}</div>
                {c.id === winner && <span className="text-sm font-bold text-emerald-600">🏆 {t('elections.winner')}</span>}
              </div>
              {c.program && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{c.program}</p>}
              {results && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 text-xs text-muted">{t('elections.votes', { count: num(v) })}</div>
                </div>
              )}
              {canVote && (
                <Button className="mt-3 w-full" onClick={() => confirm(t('common.confirm')) && vote.run(c.id)} loading={vote.pending}>
                  {t('elections.vote')}
                </Button>
              )}
              {canManage && election.status === 'draft' && (
                <Button variant="ghost" className="mt-2" onClick={() => remove.run(c.id)}>
                  {t('common.delete')}
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      {canManage && election.status === 'draft' && <CandidateForm electionId={election.id} country={election.country_code} />}
      {canManage && election.status === 'draft' && (
        <Button onClick={() => setStatus.run('open')} loading={setStatus.pending}>
          {t('gov.open')}
        </Button>
      )}
      {canManage && election.status === 'open' && (
        <Button variant="danger" onClick={() => confirm(t('common.confirm')) && setStatus.run('closed')} loading={setStatus.pending}>
          {t('gov.close')}
        </Button>
      )}
    </div>
  )
}
