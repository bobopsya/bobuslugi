import { useI18n } from '../lib/i18n'
import { useCountryName, useProfileMap } from '../lib/queries'
import { useSignedUrl } from '../lib/storage'
import { mrz, seriesAndNumber } from '../lib/translit'
import type { DocumentRow } from '../lib/types'
import { cx } from './ui'

function Line({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div className="border-b border-rose-900/15 pb-1">
      <div className="text-[9px] uppercase tracking-wider text-rose-900/60">{label}</div>
      <div className={cx('font-bold uppercase text-slate-900', big ? 'text-base' : 'text-sm')}>{value || '—'}</div>
    </div>
  )
}

const paper =
  'bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.7),transparent_40%),repeating-radial-gradient(circle_at_70%_60%,rgba(190,24,93,.05)_0_2px,transparent_2px_9px)] bg-rose-50'

/** Разворот Бобопаспорта: верхняя страница с данными о выдаче, нижняя — с фото и личными данными. */
export function PassportSpread({ doc }: { doc: DocumentRow }) {
  const { t, date, lang } = useI18n()
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  const photo = useSignedUrl('photos', doc.photo_path)
  const holderSig = useSignedUrl('signatures', doc.holder_signature_path)
  const officialSig = useSignedUrl('signatures', profileOf(doc.issued_by)?.signature_path)
  const d = doc.data ?? {}
  const { series, num } = seriesAndNumber(doc.number)
  const [m1, m2] = mrz(doc)
  const invalid = Boolean(doc.revoked_at)

  return (
    <div data-testid="passport-spread" className={cx('mx-auto w-full max-w-md overflow-hidden rounded-2xl shadow-lg ring-1 ring-rose-900/20', invalid && 'opacity-60 grayscale')}>
      {/* Верхняя страница */}
      <div className={cx('relative p-5 pr-9', paper)}>
        <div className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-rose-900/70">
          {t('docflow.passportTitle', { country: countryName(doc.country_code, lang === 'psy') })}
        </div>
        <div className="space-y-2">
          <Line label={t('docflow.issuedBy')} value={doc.issuer ?? countryName(doc.country_code)} />
          <div className="grid grid-cols-2 gap-3">
            <Line label={t('docflow.issueDate')} value={date(doc.issued_at)} />
            <Line label={t('docflow.divisionCode')} value={doc.division_code ?? '—'} />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="text-[9px] uppercase tracking-wider text-rose-900/60">{t('docflow.officialSignature')}</div>
            {officialSig.data ? <img src={officialSig.data} alt="" className="h-10 max-w-40 object-contain" /> : <span className="h-10" />}
            <svg viewBox="0 0 80 80" className="h-16 w-16 -rotate-12 opacity-70" aria-hidden>
              <circle cx="40" cy="40" r="36" fill="none" stroke="#1d4ed8" strokeWidth="3" />
              <circle cx="40" cy="40" r="27" fill="none" stroke="#1d4ed8" strokeWidth="1.5" />
              <text x="40" y="46" textAnchor="middle" fontSize="18" fontWeight="900" fill="#1d4ed8">
                ★
              </text>
            </svg>
          </div>
        </div>
        <div className="absolute inset-y-0 right-1 flex w-6 items-center justify-center overflow-hidden">
          <span className="whitespace-nowrap font-mono text-xs font-bold tracking-widest text-rose-600 [writing-mode:vertical-rl]">
            {series} {num}
          </span>
        </div>
      </div>

      <div className="h-px bg-rose-900/30" />

      {/* Нижняя страница */}
      <div className={cx('relative p-5 pr-9', paper)}>
        <div className="flex gap-4">
          <div className="w-28 shrink-0">
            <div className="aspect-[3/4] overflow-hidden rounded bg-slate-200 ring-1 ring-slate-400">
              {photo.data ? (
                <img src={photo.data} alt="" data-testid="passport-photo" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-3xl text-slate-400">👤</div>
              )}
            </div>
            <div className="mt-2 text-[9px] uppercase tracking-wider text-rose-900/60">{t('docflow.holderSignature')}</div>
            {holderSig.data ? <img src={holderSig.data} alt="" className="h-9 w-full object-contain" /> : <div className="h-9" />}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Line label={t('fields.last_name')} value={d.last_name} big />
            <Line label={t('fields.first_name')} value={d.first_name} big />
            <Line label={t('fields.patronymic')} value={d.patronymic} />
            <div className="grid grid-cols-2 gap-2">
              <Line label={t('fields.sex')} value={d.sex ? t(`docflow.sexShort.${d.sex}`) : '—'} />
              <Line label={t('fields.birth_date')} value={d.birth_date ? date(d.birth_date) : '—'} />
            </div>
            <Line label={t('fields.birth_place')} value={d.birth_place} />
            {doc.type === 'passport' && profileOf(doc.user_id)?.registered_address && (
              <Line label={t('property.registeredAt')} value={profileOf(doc.user_id)?.registered_address} />
            )}
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded bg-white/70 px-2 py-1 font-mono text-[10px] leading-4 tracking-[0.12em] text-slate-800 sm:text-[11px]">
          <div className="truncate">{m1}</div>
          <div className="truncate">{m2}</div>
        </div>
        <div className="absolute inset-y-0 right-1 flex w-6 items-center justify-center overflow-hidden">
          <span className="whitespace-nowrap font-mono text-xs font-bold tracking-widest text-rose-600 [writing-mode:vertical-rl]">
            {series} {num}
          </span>
        </div>
        {invalid && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded border-4 border-rose-600 px-3 py-1 text-2xl font-black uppercase text-rose-600">
              {t('cabinet.revoked')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
