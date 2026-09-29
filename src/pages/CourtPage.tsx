import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PdfButton } from '../components/PdfButton'
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageTitle, Row, Select, Textarea } from '../components/ui'
import { callRpc, useAction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { pdf, usePdfCtx } from '../lib/pdf/usePdf'
import { useCountryName, useLawsuit, useLawsuits, useProfileMap, useProfiles } from '../lib/queries'
import type { Lawsuit, LawsuitStatus } from '../lib/types'
import { NotFoundPage } from './MiscPages'

const tone: Record<LawsuitStatus, 'blue' | 'yellow' | 'green' | 'gray'> = { filed: 'blue', hearing: 'yellow', decided: 'green', dismissed: 'gray' }

export function LawsuitBadge({ status }: { status: LawsuitStatus }) {
  const { t } = useI18n()
  return <Badge tone={tone[status]}>{t(`court.status.${status}`)}</Badge>
}

export function LawsuitList({ items }: { items: Lawsuit[] }) {
  const { t, coins, date } = useI18n()
  const profileOf = useProfileMap()
  if (!items.length) return <Empty>{t('court.empty')}</Empty>
  return (
    <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
      {items.map((s) => (
        <Link key={s.id} to={`/court/${s.id}`} className="flex items-center gap-3 p-4 hover:bg-brand-50/50" data-testid="lawsuit-row">
          <span className="text-2xl" aria-hidden>
            ⚖️
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">
              {t('court.caseTitle', { id: s.id })}: {profileOf(s.plaintiff_id)?.display_name ?? '…'} → {profileOf(s.defendant_id)?.display_name ?? '…'}
            </span>
            <span className="block truncate text-sm text-muted">
              {coins(s.amount)} · {date(s.created_at)}
            </span>
          </span>
          <LawsuitBadge status={s.status} />
        </Link>
      ))}
    </div>
  )
}

function FileLawsuit() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: profiles } = useProfiles()
  const [defendant, setDefendant] = useState('')
  const [amount, setAmount] = useState('')
  const [claim, setClaim] = useState('')
  const file = useAction(
    () => callRpc<{ ok: true; id: number }>('file_lawsuit', { p_defendant: defendant, p_amount: Number(amount || 0), p_claim: claim }),
    (r) => navigate(`/court/${r.id}`),
  )
  return (
    <Card>
      <h2 className="mb-1 text-lg font-black">{t('court.file')}</h2>
      <p className="mb-4 text-sm text-muted">{t('court.fileHint')}</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          file.run()
        }}
      >
        <Field label={t('court.defendant')}>
          <Select name="defendant" value={defendant} onChange={(e) => setDefendant(e.target.value)} required>
            <option value="">—</option>
            {(profiles ?? [])
              .filter((p) => p.id !== profile?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name} (@{p.login})
                </option>
              ))}
          </Select>
        </Field>
        <Field label={t('court.amount')}>
          <Input name="amount" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label={t('court.claim')}>
          <Textarea name="claim" value={claim} onChange={(e) => setClaim(e.target.value)} maxLength={3000} required />
        </Field>
        <ErrorBox error={file.error} />
        <Button type="submit" loading={file.pending}>
          {t('court.submit')}
        </Button>
      </form>
    </Card>
  )
}

export function CourtPage() {
  const { t } = useI18n()
  const { profile } = useAuth()
  const { data, isLoading } = useLawsuits()
  const mine = (data ?? []).filter((s) => s.plaintiff_id === profile?.id || s.defendant_id === profile?.id)
  return (
    <>
      <PageTitle sub={t('court.subtitle')}>{t('court.title')}</PageTitle>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>{isLoading ? <Loading /> : <LawsuitList items={mine} />}</div>
        <FileLawsuit />
      </div>
    </>
  )
}

export function CourtCasePage() {
  const { id } = useParams()
  const suitId = Number(id)
  const { t, coins, date, lang } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  const { data: s, isLoading } = useLawsuit(suitId)
  const [defense, setDefense] = useState('')
  const [at, setAt] = useState('')
  const [place, setPlace] = useState('')
  const [awarded, setAwarded] = useState('')
  const [verdict, setVerdict] = useState('')
  const answer = useAction(() => callRpc('answer_lawsuit', { p_id: suitId, p_defense: defense }))
  const schedule = useAction(() => callRpc('schedule_hearing', { p_id: suitId, p_at: new Date(at).toISOString(), p_place: place }))
  const decide = useAction(() => callRpc('decide_lawsuit', { p_id: suitId, p_awarded: Number(awarded || 0), p_verdict: verdict }))

  if (isLoading) return <Loading />
  if (!s || !profile) return <NotFoundPage />
  const open = s.status === 'filed' || s.status === 'hearing'
  const isDefendant = profile.id === s.defendant_id
  const isJudge =
    profile.role === 'superadmin' ||
    ((profile.role === 'official' || profile.role === 'president') &&
      profile.gov_country_code === s.country_code &&
      profile.id !== s.plaintiff_id &&
      profile.id !== s.defendant_id)

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/court" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('court.title')}
      </Link>
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-black">⚖️ {t('court.caseTitle', { id: s.id })}</h1>
          <LawsuitBadge status={s.status} />
        </div>
        <Row label={t('court.plaintiff')}>{profileOf(s.plaintiff_id)?.display_name ?? '—'}</Row>
        <Row label={t('court.defendant')}>{profileOf(s.defendant_id)?.display_name ?? '—'}</Row>
        <Row label={t('common.country')}>{countryName(s.country_code, lang === 'psy')}</Row>
        <Row label={t('court.amount')}>{coins(s.amount)}</Row>
        <Row label={t('cabinet.submittedAt')}>{date(s.created_at, true)}</Row>
        {s.hearing_at && (
          <Row label={t('court.hearing')}>
            {new Date(s.hearing_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}, {s.place}
          </Row>
        )}
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('court.claim')}</div>
            <p className="mt-1 whitespace-pre-wrap">{s.claim}</p>
          </div>
          {s.defense && (
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted">{t('court.defense')}</div>
              <p className="mt-1 whitespace-pre-wrap">{s.defense}</p>
            </div>
          )}
          {s.verdict && (
            <div className="rounded-xl bg-brand-50 p-4" data-testid="verdict">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-700">{t('court.verdict')}</div>
              <p className="mt-1 whitespace-pre-wrap">{s.verdict}</p>
              <p className="mt-2 font-bold">{t('court.awarded', { amount: coins(s.awarded ?? 0) })}</p>
              <p className="text-sm text-muted">
                {t('court.judge')}: {profileOf(s.judge_id)?.display_name ?? '—'} · {date(s.decided_at)}
              </p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <PdfButton label={t('court.claimPdf')} make={async () => (await pdf()).lawsuitPdf(ctx, s)} />
          {s.decided_at && <PdfButton label={t('court.decisionPdf')} make={async () => (await pdf()).courtDecisionPdf(ctx, s)} />}
        </div>
      </Card>

      {isDefendant && open && (
        <Card className="space-y-3">
          <Field label={t('court.defense')}>
            <Textarea name="defense" value={defense} onChange={(e) => setDefense(e.target.value)} maxLength={3000} />
          </Field>
          <ErrorBox error={answer.error} />
          {answer.done && <Alert tone="green">{t('cabinet.saved')}</Alert>}
          <Button onClick={() => answer.run()} disabled={!defense.trim()} loading={answer.pending}>
            {t('court.answer')}
          </Button>
        </Card>
      )}

      {isJudge && open && (
        <Card className="space-y-4">
          <h2 className="text-lg font-black">{t('court.judgePanel')}</h2>
          {!profile.signature_path && (
            <Alert tone="yellow">
              {t('docflow.needSignatureFirst')}{' '}
              <Link to="/cabinet/settings" className="font-bold underline">
                {t('cabinet.settings')} →
              </Link>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('court.hearingAt')}>
              <Input name="hearingAt" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
            </Field>
            <Field label={t('court.place')}>
              <Input name="place" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder={t('court.placePh')} />
            </Field>
          </div>
          <ErrorBox error={schedule.error} />
          <Button variant="secondary" onClick={() => schedule.run()} disabled={!at || !place.trim()} loading={schedule.pending}>
            📅 {t('court.schedule')}
          </Button>
          <hr className="border-slate-100" />
          <Field label={t('court.awardField', { max: coins(s.amount) })}>
            <Input name="awarded" type="number" min={0} max={s.amount} value={awarded} onChange={(e) => setAwarded(e.target.value)} />
          </Field>
          <Field label={t('court.verdict')}>
            <Textarea name="verdict" value={verdict} onChange={(e) => setVerdict(e.target.value)} maxLength={3000} />
          </Field>
          <ErrorBox error={decide.error} />
          <Button onClick={() => decide.run()} disabled={!verdict.trim() || !profile.signature_path} loading={decide.pending}>
            🔨 {t('court.decide')}
          </Button>
        </Card>
      )}
    </div>
  )
}
