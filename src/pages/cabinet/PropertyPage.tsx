import { useState } from 'react'
import { CabinetNav } from '../../components/CabinetNav'
import { DocumentCard } from '../../components/DocumentCard'
import { PdfButton } from '../../components/PdfButton'
import { Alert, Button, ButtonLink, Card, Empty, ErrorBox, Input, Loading, PageTitle, SectionTitle, Select } from '../../components/ui'
import { callRpc, useAction } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { pdf, usePdfCtx } from '../../lib/pdf/usePdf'
import { useMyDocuments, useProfileMap, useProfiles, usePropertyOffers } from '../../lib/queries'
import type { DocumentRow } from '../../lib/types'

const TYPES = ['business_reg', 'license', 'property', 'vehicle'] as const

function SellForm({ doc }: { doc: DocumentRow }) {
  const { t } = useI18n()
  const { profile } = useAuth()
  const { data: profiles } = useProfiles()
  const [to, setTo] = useState('')
  const [price, setPrice] = useState('')
  const offer = useAction(() => callRpc('offer_property', { p_doc: doc.id, p_to: to, p_price: Number(price || 0) }))
  return (
    <details className="rounded-lg bg-white/15 p-2 text-sm">
      <summary className="cursor-pointer font-bold">{t('property.sell')}</summary>
      <div className="mt-2 space-y-2 text-ink">
        <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('property.buyer')}>
          <option value="">{t('property.buyer')}</option>
          {(profiles ?? [])
            .filter((p) => p.id !== profile?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name} (@{p.login})
              </option>
            ))}
        </Select>
        <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t('property.price')} />
        <ErrorBox error={offer.error} />
        {offer.done ? (
          <Alert tone="green">{t('property.offerSent')}</Alert>
        ) : (
          <Button type="button" onClick={() => offer.run()} disabled={!to} loading={offer.pending}>
            {t('property.offer')}
          </Button>
        )}
      </div>
    </details>
  )
}

export function PropertyPage() {
  const { t, coins } = useI18n()
  const { profile } = useAuth()
  const ctx = usePdfCtx()
  const docs = useMyDocuments()
  const offers = usePropertyOffers()
  const profileOf = useProfileMap()
  const register = useAction((docId: number | null) => callRpc('set_registration', { p_doc: docId }))
  const respond = useAction((a: { id: number; accept: boolean }) => callRpc('respond_offer', { p_offer: a.id, p_accept: a.accept }))

  if (docs.isLoading) return <Loading />
  const mine = (docs.data ?? []).filter((d) => (TYPES as readonly string[]).includes(d.type) && !d.revoked_at)
  const incoming = (offers.data ?? []).filter((o) => o.to_user === profile?.id && o.status === 'pending')
  const outgoing = (offers.data ?? []).filter((o) => o.from_user === profile?.id && o.status === 'pending')

  return (
    <>
      <PageTitle>{t('property.title')}</PageTitle>
      <CabinetNav />

      {profile?.registered_address && (
        <div className="mb-4">
          <Alert tone="blue">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>
                🏠 {t('property.registeredAt')}: <b>{profile.registered_address}</b>
              </span>
              <Button variant="ghost" onClick={() => register.run(null)}>
                {t('property.unregister')}
              </Button>
            </span>
          </Alert>
        </div>
      )}

      {incoming.length > 0 && (
        <Card className="mb-6 space-y-3">
          <SectionTitle>{t('property.incoming')}</SectionTitle>
          <ErrorBox error={respond.error} />
          {incoming.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3" data-testid="incoming-offer">
              <span className="min-w-0 flex-1">
                {t('property.offerFrom', { name: profileOf(o.from_user)?.display_name ?? '…', price: coins(o.price) })}
              </span>
              <Button onClick={() => respond.run({ id: o.id, accept: true })} loading={respond.pending}>
                {t('property.buy')}
              </Button>
              <Button variant="ghost" onClick={() => respond.run({ id: o.id, accept: false })}>
                {t('property.decline')}
              </Button>
            </div>
          ))}
        </Card>
      )}

      {mine.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((d) => {
            const pending = outgoing.find((o) => o.document_id === d.id)
            return (
              <DocumentCard
                key={d.id}
                doc={d}
                holder={profile ?? undefined}
                action={
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <PdfButton variant="secondary" make={async () => (await pdf()).documentPdf(ctx, d, profile ?? undefined)} />
                      {d.type === 'property' && profile?.registered_address !== d.data?.address && (
                        <Button variant="secondary" onClick={() => register.run(d.id)} loading={register.pending}>
                          {t('property.register')}
                        </Button>
                      )}
                    </div>
                    {(d.type === 'property' || d.type === 'vehicle') &&
                      (pending ? (
                        <div className="flex items-center gap-2 text-sm">
                          <span>{t('property.pendingTo', { name: profileOf(pending.to_user)?.display_name ?? '…', price: coins(pending.price) })}</span>
                          <Button variant="ghost" onClick={() => respond.run({ id: pending.id, accept: false })}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <SellForm doc={d} />
                      ))}
                  </div>
                }
              />
            )
          })}
        </div>
      ) : (
        <Empty>
          <p className="mb-4">{t('property.empty')}</p>
          <ButtonLink to="/services">{t('catalog.title')}</ButtonLink>
        </Empty>
      )}
    </>
  )
}
