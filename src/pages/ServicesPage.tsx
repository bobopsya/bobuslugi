import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ServiceTile } from '../components/ServiceTile'
import { Alert, Button, ButtonLink, Card, ErrorBox, Field, Loading, PageTitle, Select } from '../components/ui'
import { callRpc, useAction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountries, useCountryName, useMyDocuments, useServices } from '../lib/queries'
import { CATEGORY_ICONS, CATEGORY_ORDER, resolveTarget, serviceDef } from '../lib/services'
import { FormField } from '../components/FormField'
import { ServiceWizard } from '../components/wizard/ServiceWizard'
import { NotFoundPage } from './MiscPages'

export function ServicesPage() {
  const { t } = useI18n()
  const { data, isLoading } = useServices()
  if (isLoading) return <Loading />
  return (
    <>
      <PageTitle>{t('catalog.title')}</PageTitle>
      <div className="space-y-10">
        {CATEGORY_ORDER.map((cat) => {
          const items = (data ?? []).filter((s) => s.category === cat && s.active)
          if (!items.length) return null
          return (
            <section key={cat}>
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
                <span aria-hidden>{CATEGORY_ICONS[cat]}</span> {t(`categories.${cat}`)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => (
                  <ServiceTile key={s.code} service={s} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </>
  )
}

export function ServicePage() {
  const { code = '' } = useParams()
  const { t, coins, lang } = useI18n()
  const { profile, session } = useAuth()
  const services = useServices()
  const countries = useCountries()
  const docs = useMyDocuments()
  const countryName = useCountryName()
  const [chosen, setChosen] = useState<string>('')
  const [data, setData] = useState<Record<string, string>>({})
  const [createdId, setCreatedId] = useState<number | null>(null)

  const submit = useAction(
    (args: { target: string | null; data: Record<string, string> }) =>
      callRpc<{ ok: true; id: number }>('submit_application', { p_service: code, p_target: args.target, p_data: args.data }),
    (r) => setCreatedId(r.id),
  )

  if (services.isLoading || countries.isLoading) return <Loading />
  const service = services.data?.find((s) => s.code === code)
  const def = serviceDef(code)
  if (!service || !def) return <NotFoundPage />

  const target = resolveTarget(service.target_mode, service.fixed_target, profile, chosen || null)
  const targetCountry = countries.data?.find((c) => c.code === target)
  const problem = profile ? (def.check?.(profile, docs.data ?? [], target) ?? null) : null
  const choosable = (countries.data ?? []).filter((c) => service.target_mode !== 'foreign' || c.code !== profile?.country_code)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, v.trim()]))
    submit.run({ target, data: clean })
  }

  return (
    <div className={service.needs_photo ? 'mx-auto max-w-3xl' : 'mx-auto max-w-2xl'}>
      <Link to="/services" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('catalog.title')}
      </Link>
      <div className="mb-6 mt-3 flex items-start gap-4">
        <span className="text-5xl" aria-hidden>
          {def.icon}
        </span>
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">{t(`services.${code}.title`)}</h1>
          <p className="mt-1 text-muted">{t(`services.${code}.desc`)}</p>
          <p className="mt-2 text-sm font-bold text-brand-700">
            {service.fee > 0 ? t('catalog.fee', { amount: coins(service.fee) }) : t('catalog.free')}
          </p>
        </div>
      </div>

      <Card>
        {!service.active ? (
          <Alert tone="gray">{t('catalog.inactive')}</Alert>
        ) : !session ? (
          <div className="text-center">
            <p className="mb-4 text-muted">{t('catalog.loginToApply')}</p>
            <ButtonLink to={`/login?next=${encodeURIComponent(`/services/${code}`)}`}>{t('nav.login')}</ButtonLink>
          </div>
        ) : createdId ? (
          <div className="text-center" data-testid="applied">
            <div className="mb-3 text-5xl" aria-hidden>
              ✅
            </div>
            <p className="mb-5 font-bold">{t('catalog.applied', { id: createdId })}</p>
            <ButtonLink to={`/cabinet/applications/${createdId}`}>{t('catalog.toApplication')}</ButtonLink>
          </div>
        ) : service.needs_photo ? (
          problem ? (
            <Alert tone="yellow">{t(`errors.${problem}`)}</Alert>
          ) : (
            <ServiceWizard service={service} onCreated={setCreatedId} />
          )
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {(service.target_mode === 'any' || service.target_mode === 'foreign') && (
              <Field label={t('fields.target')}>
                <Select name="target" value={chosen} onChange={(e) => setChosen(e.target.value)} required>
                  <option value="">{t('catalog.chooseCountry')}</option>
                  {choosable.map((c) => (
                    <option key={c.code} value={c.code}>
                      {lang === 'psy' ? c.psy_name : c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {target && <p className="text-sm text-muted">{t('catalog.reviewedBy', { country: countryName(target, lang === 'psy') })}</p>}

            {def.fields.map((f) => (
              <FormField
                key={f.name}
                field={f}
                value={data[f.name] ?? ''}
                onChange={(v) => setData((d) => ({ ...d, [f.name]: v }))}
                cities={targetCountry?.cities ?? []}
              />
            ))}

            {problem && <Alert tone="yellow">{t(`errors.${problem}`)}</Alert>}
            <ErrorBox error={submit.error} />
            <Button type="submit" loading={submit.pending} disabled={Boolean(problem)} className="w-full sm:w-auto">
              {t('catalog.apply')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
