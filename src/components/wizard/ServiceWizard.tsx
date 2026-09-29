import { useEffect, useMemo, useState } from 'react'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useCountries, useCountryName, useMyDocuments } from '../../lib/queries'
import { resolveTarget, serviceDef } from '../../lib/services'
import { uploadFile, useSignedUrl } from '../../lib/storage'
import type { Anketa, ServiceRow } from '../../lib/types'
import { Exam } from '../Exam'
import { FormField } from '../FormField'
import { PhotoCapture } from '../PhotoCapture'
import { SignaturePad } from '../SignaturePad'
import { SlotPicker } from '../SlotPicker'
import { Alert, Button, cx, ErrorBox, Field, Input, Row, Select } from '../ui'

type Step = 'anketa' | 'photo' | 'exam' | 'oath' | 'appointment' | 'signature' | 'review'

type Draft = {
  target: string
  data: Record<string, string>
  photoPath: string | null
  examAttempt: number | null
  slotId: number | null
}

const ANKETA_KEYS: (keyof Anketa)[] = ['last_name', 'first_name', 'patronymic', 'sex', 'birth_date', 'birth_place']

function draftKey(userId: string, code: string) {
  return `bobuslugi.draft.${userId}.${code}`
}

function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function saveDraft(key: string, d: Draft | null) {
  try {
    if (d) localStorage.setItem(key, JSON.stringify(d))
    else localStorage.removeItem(key)
  } catch {
    // черновик просто не сохранится
  }
}

export function fullName(d: Anketa | Record<string, string | undefined>) {
  return [d.last_name, d.first_name, d.patronymic].filter(Boolean).join(' ')
}

function Stepper({ steps, current, onJump }: { steps: Step[]; current: number; onJump: (i: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="mb-6">
      {/* Телефон: компактно «Шаг 2 из 6» и полоса прогресса */}
      <div className="sm:hidden" data-testid="stepper-compact">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-black text-brand-700">{t(`docflow.step.${steps[current]}`)}</span>
          <span className="text-xs font-bold text-muted">{t('docflow.stepOf', { n: current + 1, total: steps.length })}</span>
        </div>
        <div className="mt-2 flex gap-1">
          {steps.map((s, i) => (
            <span key={s} className={cx('h-1.5 flex-1 rounded-full', i < current ? 'bg-emerald-500' : i === current ? 'bg-brand-600' : 'bg-slate-200')} />
          ))}
        </div>
      </div>
      {/* Широкий экран: все шаги */}
      <ol className="hidden gap-1 sm:flex">
        {steps.map((s, i) => (
          <li key={s} className="min-w-0 flex-1">
            <button
              type="button"
              disabled={i > current}
              onClick={() => onJump(i)}
              className={cx(
                'w-full truncate rounded-lg border-b-4 px-2 py-2 text-left text-xs font-bold',
                i < current && 'border-emerald-500 text-emerald-700',
                i === current && 'border-brand-600 text-brand-700',
                i > current && 'border-slate-200 text-slate-400',
              )}
            >
              {i + 1}. {t(`docflow.step.${s}`)}
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Мастер оформления документа с анкетой, фото, подписью, экзаменом и записью на приём. */
export function ServiceWizard({ service, onCreated }: { service: ServiceRow; onCreated: (id: number) => void }) {
  const { t, coins, lang, date } = useI18n()
  const { profile } = useAuth()
  const countries = useCountries()
  const docs = useMyDocuments()
  const countryName = useCountryName()
  const def = serviceDef(service.code)!
  const key = draftKey(profile!.id, service.code)

  const steps: Step[] = service.needs_exam
    ? ['anketa', 'photo', 'exam', 'oath', 'appointment', 'review']
    : ['anketa', 'photo', 'signature', 'review']

  const [draft, setDraft] = useState<Draft>(
    () => loadDraft(key) ?? { target: '', data: {}, photoPath: null, examAttempt: null, slotId: null },
  )
  const [stepIdx, setStepIdx] = useState(0)
  const [signature, setSignature] = useState<Blob | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [photoError, setPhotoError] = useState<unknown>(null)
  const photoUrl = useSignedUrl('photos', draft.photoPath)

  useEffect(() => saveDraft(key, draft), [key, draft])

  // Анкета из действующего паспорта, если он есть
  const passport = useMemo(
    () => (docs.data ?? []).find((d) => d.type === 'passport' && !d.revoked_at && d.country_code === profile?.country_code),
    [docs.data, profile?.country_code],
  )
  useEffect(() => {
    if (!passport || draft.data.last_name) return
    const fromPassport = Object.fromEntries(ANKETA_KEYS.map((k) => [k, passport.data?.[k] ?? '']).filter(([, v]) => v))
    setDraft((d) => ({ ...d, data: { ...fromPassport, ...d.data } }))
  }, [passport, draft.data.last_name])

  const target = resolveTarget(service.target_mode, service.fixed_target, profile, draft.target || null)
  const targetCountry = countries.data?.find((c) => c.code === target)
  const choosable = (countries.data ?? []).filter((c) => service.target_mode !== 'foreign' || c.code !== profile?.country_code)
  const step = steps[stepIdx]
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, data: { ...d.data, [k]: v } }))
  const d = draft.data

  const anketaOk =
    Boolean(target) &&
    Boolean(d.last_name?.trim() && d.first_name?.trim() && d.birth_place?.trim()) &&
    (d.sex === 'М' || d.sex === 'Ж') &&
    /^\d{4}-\d{2}-\d{2}$/.test(d.birth_date ?? '') &&
    def.fields.every((f) => !f.required || (d[f.name] ?? '').trim() !== '')

  const canNext: Record<Step, boolean> = {
    anketa: anketaOk,
    photo: Boolean(draft.photoPath),
    exam: Boolean(draft.examAttempt),
    oath: d.oath === 'true' && Boolean(signature),
    appointment: Boolean(draft.slotId),
    signature: Boolean(signature),
    review: true,
  }

  const submit = useAction(
    async () => {
      const signaturePath = await uploadFile('signatures', profile!.id, signature!)
      return callRpc<{ ok: true; id: number }>('submit_application', {
        p_service: service.code,
        p_target: target,
        p_data: Object.fromEntries(Object.entries(d).filter(([, v]) => v !== '').map(([k, v]) => [k, v.trim()])),
        p_photo_path: draft.photoPath,
        p_signature_path: signaturePath,
        p_slot_id: service.needs_exam ? draft.slotId : null,
        p_exam_attempt: service.needs_exam ? draft.examAttempt : null,
      })
    },
    (r) => {
      saveDraft(key, null)
      onCreated(r.id)
    },
  )

  const onPhoto = async (blob: Blob | null) => {
    if (!blob) return
    setPhotoUploading(true)
    setPhotoError(null)
    try {
      const path = await uploadFile('photos', profile!.id, blob)
      setDraft((dr) => ({ ...dr, photoPath: path }))
    } catch (e) {
      setPhotoError(e)
    } finally {
      setPhotoUploading(false)
    }
  }

  return (
    <div>
      <Stepper steps={steps} current={stepIdx} onJump={setStepIdx} />

      {step === 'anketa' && (
        <div className="space-y-4">
          {(service.target_mode === 'any' || service.target_mode === 'foreign') && (
            <Field label={t('fields.target')}>
              <Select name="target" value={draft.target} onChange={(e) => setDraft((dr) => ({ ...dr, target: e.target.value, slotId: null }))}>
                <option value="">{t('catalog.chooseCountry')}</option>
                {choosable.map((c) => (
                  <option key={c.code} value={c.code}>
                    {lang === 'psy' ? c.psy_name : c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('fields.last_name')}>
              <Input name="last_name" value={d.last_name ?? ''} onChange={(e) => set('last_name', e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('fields.first_name')}>
              <Input name="first_name" value={d.first_name ?? ''} onChange={(e) => set('first_name', e.target.value)} maxLength={60} />
            </Field>
            <Field label={t('fields.patronymic')}>
              <Input name="patronymic" value={d.patronymic ?? ''} onChange={(e) => set('patronymic', e.target.value)} maxLength={60} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <fieldset>
              <legend className="mb-1 block text-sm font-bold text-ink">{t('fields.sex')}</legend>
              <div className="flex gap-2">
                {(['М', 'Ж'] as const).map((s) => (
                  <label key={s} className={cx('flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 ring-1', d.sex === s ? 'bg-brand-50 ring-2 ring-brand-500' : 'ring-slate-300')}>
                    <input type="radio" name="sex" value={s} checked={d.sex === s} onChange={() => set('sex', s)} />
                    {t(`docflow.sex.${s}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label={t('fields.birth_date')}>
              <Input name="birth_date" type="date" value={d.birth_date ?? ''} onChange={(e) => set('birth_date', e.target.value)} />
            </Field>
            <Field label={t('fields.birth_place')}>
              <Input name="birth_place" value={d.birth_place ?? ''} onChange={(e) => set('birth_place', e.target.value)} maxLength={100} />
            </Field>
          </div>
          {def.fields.map((f) => (
            <FormField key={f.name} field={f} value={d[f.name] ?? ''} onChange={(v) => set(f.name, v)} cities={targetCountry?.cities ?? []} />
          ))}
        </div>
      )}

      {step === 'photo' && (
        <div className="space-y-3">
          <PhotoCapture onChange={onPhoto} preview={photoUrl.data ?? null} />
          {photoUploading && <p className="text-sm text-muted">{t('common.loading')}</p>}
          <ErrorBox error={photoError} />
        </div>
      )}

      {step === 'exam' && <Exam onPassed={(id) => setDraft((dr) => ({ ...dr, examAttempt: id }))} />}
      {step === 'exam' && draft.examAttempt && (
        <div className="mt-4">
          <Alert tone="green">✓ {t('docflow.examOk')}</Alert>
        </div>
      )}

      {step === 'oath' && (
        <div className="space-y-4">
          <blockquote className="rounded-xl bg-brand-50 p-5 leading-relaxed text-brand-900">
            {t('docflow.oathText', {
              name: fullName(d) || profile!.display_name,
              country: countryName(target, lang === 'psy'),
            })}
          </blockquote>
          <label className="flex items-center gap-3 font-bold">
            <input
              type="checkbox"
              name="oath"
              className="h-5 w-5"
              checked={d.oath === 'true'}
              onChange={(e) => set('oath', e.target.checked ? 'true' : '')}
            />
            {t('docflow.oathAccept')}
          </label>
          <Field label={t('docflow.applicantSignature')}>
            <SignaturePad onChange={setSignature} />
          </Field>
        </div>
      )}

      {step === 'appointment' && (
        <div className="space-y-3">
          <p>{t('docflow.appointmentIntro', { country: countryName(target, lang === 'psy') })}</p>
          <SlotPicker country={target} value={draft.slotId} onChange={(id) => setDraft((dr) => ({ ...dr, slotId: id }))} />
        </div>
      )}

      {step === 'signature' && (
        <Field label={t('docflow.applicantSignature')}>
          <SignaturePad onChange={setSignature} />
        </Field>
      )}

      {step === 'review' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {photoUrl.data && <img src={photoUrl.data} alt="" className="h-40 w-30 rounded-lg object-cover ring-1 ring-slate-300" />}
            <div className="flex-1">
              <Row label={t('fields.target')}>{countryName(target, lang === 'psy')}</Row>
              <Row label={t('docflow.fullName')}>{fullName(d)}</Row>
              <Row label={t('fields.sex')}>{d.sex ? t(`docflow.sex.${d.sex}`) : '—'}</Row>
              <Row label={t('fields.birth_date')}>{d.birth_date ? date(d.birth_date) : '—'}</Row>
              <Row label={t('fields.birth_place')}>{d.birth_place}</Row>
              {def.fields.map((f) => (
                <Row key={f.name} label={t(`fields.${f.label ?? f.name}`)}>
                  {d[f.name] || '—'}
                </Row>
              ))}
              <Row label={t('cabinet.fee')}>{service.fee > 0 ? coins(service.fee) : t('catalog.free')}</Row>
            </div>
          </div>
          {!signature && <Alert tone="yellow">{t('docflow.signAgain')}</Alert>}
          <ErrorBox error={submit.error} />
          <Button type="button" onClick={() => submit.run()} loading={submit.pending} disabled={!signature}>
            {t('catalog.apply')}
          </Button>
        </div>
      )}

      {step !== 'review' && (
        <div className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
          {stepIdx > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStepIdx((i) => i - 1)}>
              ← {t('common.back')}
            </Button>
          )}
          <Button type="button" onClick={() => setStepIdx((i) => i + 1)} disabled={!canNext[step]}>
            {t('docflow.next')} →
          </Button>
        </div>
      )}
      {step === 'review' && (
        <div className="mt-4">
          <Button type="button" variant="ghost" onClick={() => setStepIdx((i) => i - 1)}>
            ← {t('common.back')}
          </Button>
        </div>
      )}
    </div>
  )
}
