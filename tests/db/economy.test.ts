import { beforeAll, describe, expect, it } from 'vitest'
import {
  anon,
  approveAndReceive,
  balance,
  getCitizenship,
  resetDb,
  rpc,
  setSignature,
  signUp,
  sql,
  type User,
} from './helpers'

let admin: User
let pres: User // президент Бобокаунтри
let official: User // чиновник Бобокаунтри
let alice: User // гражданка Бобокаунтри
let bob: User // гражданин Бобокаунтри
let sshpPres: User // президент СШП

async function treasury(country: string): Promise<number> {
  const [row] = await sql<{ treasury: string }>('select treasury from countries where code = $1', [country])
  return Number(row.treasury)
}

/** Подаёт заявление на услугу без фото и проводит его до получения документа. */
async function getDoc(u: User, service: string, data: Record<string, string>) {
  const app = await rpc(u, 'submit_application', { p_service: service, p_data: data })
  await approveAndReceive(u, app.id!, official)
  const [doc] = await sql<{ id: number; number: string; data: Record<string, string> }>(
    `select id::int, number, data from documents where application_id = $1`,
    [app.id],
  )
  return doc
}

beforeAll(async () => {
  await resetDb()
  await sql('update countries set population_bonus = 0, treasury = 0')
  await sql(`truncate public.treasury_tx, public.lawsuits, public.property_offers restart identity cascade`)
  admin = await signUp('admin', 'Админ')
  pres = await signUp('pres', 'Президент')
  official = await signUp('official', 'Чиновник')
  alice = await signUp('alice', 'Алиса')
  bob = await signUp('bob', 'Боб')
  sshpPres = await signUp('sshp', 'Пупянский')
  await rpc(admin, 'admin_set_role', { p_user: pres.id, p_role: 'president', p_gov_country: 'BOBO' })
  await rpc(admin, 'admin_set_country', { p_user: pres.id, p_country: 'BOBO' })
  await rpc(admin, 'admin_set_role', { p_user: official.id, p_role: 'official', p_gov_country: 'BOBO' })
  await rpc(admin, 'admin_set_role', { p_user: sshpPres.id, p_role: 'president', p_gov_country: 'SSHP' })
  for (const u of [admin, pres, official, sshpPres]) await setSignature(u)
  await getCitizenship(alice, 'BOBO', official)
  await getCitizenship(bob, 'BOBO', official)
})

describe('население', () => {
  it('президент накручивает население своей страны, но не чужой', async () => {
    await rpc(pres, 'add_population', { p_country: 'BOBO', p_amount: 4321 })
    await expect(rpc(sshpPres, 'add_population', { p_country: 'BOBO', p_amount: 123 })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await expect(rpc(alice, 'add_population', { p_country: 'BOBO', p_amount: 123 })).rejects.toThrow('E_FORBIDDEN_ACTION')
    const { data } = await anon().rpc('country_stats')
    const bobo = (data as { code: string; population: number; players: number }[]).find((c) => c.code === 'BOBO')!
    // pres, alice, bob — граждане Бобокаунтри
    expect(bobo).toMatchObject({ population: 4321 + 3, players: 3 })
  })

  it('население не уходит ниже нуля', async () => {
    await expect(rpc(pres, 'add_population', { p_country: 'BOBO', p_amount: -99999 })).rejects.toThrow('E_BAD_AMOUNT')
    await rpc(admin, 'add_population', { p_country: 'SSHP', p_amount: 123 })
  })
})

describe('казна и зарплаты', () => {
  it('пошлины и штрафы идут в казну, возврат пошлины — из казны', async () => {
    await rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: 4321 })
    const before = await treasury('BOBO')
    const app = await rpc(alice, 'submit_application', { p_service: 'license', p_data: { kind: 'Такси' } })
    expect(await treasury('BOBO')).toBe(before + 123)
    await rpc(official, 'review_application', { p_id: app.id, p_decision: 'reject', p_comment: 'Нет машины' })
    expect(await treasury('BOBO')).toBe(before)

    const f = await rpc(official, 'issue_fine', { p_user: alice.id, p_amount: 321, p_reason: 'Шум' })
    await rpc(alice, 'pay_fine', { p_id: f.id })
    expect(await treasury('BOBO')).toBe(before + 321)
  })

  it('президент выдаёт псякоины из казны или печатным станком', async () => {
    const t = await treasury('BOBO')
    await rpc(pres, 'grant_coins', { p_user: bob.id, p_amount: 123, p_source: 'treasury' })
    expect(await treasury('BOBO')).toBe(t - 123)
    await expect(rpc(pres, 'grant_coins', { p_user: bob.id, p_amount: 99999, p_source: 'treasury' })).rejects.toThrow('E_TREASURY')
    await rpc(pres, 'grant_coins', { p_user: bob.id, p_amount: 1234, p_source: 'mint' })
    expect(await treasury('BOBO')).toBe(t - 123)
    expect(await balance(bob)).toBe(123 + 1234)
  })

  it('зарплаты выплачиваются из казны целиком или не выплачиваются вовсе', async () => {
    await expect(rpc(pres, 'set_salary', { p_user: alice.id, p_amount: 123 })).rejects.toThrow('E_NOT_STAFF')
    await rpc(pres, 'set_salary', { p_user: official.id, p_amount: 1234 })
    await rpc(pres, 'set_salary', { p_user: pres.id, p_amount: 4321 })
    await expect(rpc(pres, 'pay_salaries', { p_country: 'BOBO' })).rejects.toThrow('E_TREASURY')
    expect(await balance(official)).toBe(0)

    await rpc(admin, 'admin_treasury', { p_country: 'BOBO', p_amount: 12340 })
    const t = await treasury('BOBO')
    const r = await rpc<{ count: number; total: number }>(pres, 'pay_salaries', { p_country: 'BOBO' })
    expect(r).toMatchObject({ count: 2, total: 1234 + 4321 })
    expect(await balance(official)).toBe(1234)
    expect(await treasury('BOBO')).toBe(t - 1234 - 4321)
    await expect(rpc(sshpPres, 'pay_salaries', { p_country: 'BOBO' })).rejects.toThrow('E_FORBIDDEN_ACTION')
  })

  it('журнал казны видят только госслужащие страны', async () => {
    const { data: staffSees } = await pres.client.from('treasury_tx').select('id').eq('country_code', 'BOBO')
    expect(staffSees!.length).toBeGreaterThan(0)
    const { data: citizenSees } = await alice.client.from('treasury_tx').select('id')
    expect(citizenSees).toEqual([])
  })
})

describe('бизнес и имущество', () => {
  let flat: { id: number; number: string; data: Record<string, string> }

  it('без паспорта бизнес не зарегистрировать', async () => {
    const stranger = await signUp('stranger', 'Бесстранный')
    await expect(
      rpc(stranger, 'submit_application', { p_service: 'business_registration', p_data: { name: 'Смука' } }),
    ).rejects.toThrow('E_NOT_CITIZEN')
  })

  it('ИП, лицензия, недвижимость и машина с госномером', async () => {
    await rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: 4321 })
    const biz = await getDoc(alice, 'business_registration', { name: 'Бобошаурма', org_type: 'ИП', activity: 'Общепит' })
    expect(biz.data).toMatchObject({ name: 'Бобошаурма', last_name: 'Псянская' })
    const lic = await getDoc(alice, 'license', { kind: 'Такси' })
    expect(lic.data.kind).toBe('Такси')
    flat = await getDoc(alice, 'property_registration', { address: 'Псяленд, ул. Сифовая, 1234', prop_type: 'Квартира', area: '123' })
    const car = await getDoc(alice, 'vehicle_registration', { brand: 'Бобомобиль', model: 'Пупа', color: 'Синий' })
    expect(car.number).toMatch(/^[А-Я] (123|321|1234|4321) [А-Я]{2} (123|321)$/)
    const { data: check } = await anon().rpc('verify_document', { p_number: car.number })
    expect(check).toMatchObject({ found: true, type: 'vehicle', valid: true })
  })

  it('прописка по адресу своей недвижимости', async () => {
    await rpc(alice, 'set_registration', { p_doc: flat.id })
    const [p] = await sql<{ registered_address: string }>('select registered_address from profiles where id = $1', [alice.id])
    expect(p.registered_address).toBe('Псяленд, ул. Сифовая, 1234')
    await expect(rpc(bob, 'set_registration', { p_doc: flat.id })).rejects.toThrow('E_NOT_FOUND')
  })

  it('налоги с бизнеса и имущества уходят в казну при оплате', async () => {
    await rpc(pres, 'set_country_taxes', { p_country: 'BOBO', p_business_tax: 321, p_property_tax: 123 })
    const r = await rpc<{ count: number }>(pres, 'collect_taxes', { p_country: 'BOBO' })
    expect(r.count).toBe(3) // бизнес, квартира, машина
    const taxes = await sql<{ id: number; amount: number }>(
      `select id::int, amount from fines where user_id = $1 and kind = 'tax' and status = 'unpaid' order by id`,
      [alice.id],
    )
    expect(taxes.map((t) => t.amount)).toEqual([321, 123, 123])
    const t = await treasury('BOBO')
    for (const tax of taxes) await rpc(alice, 'pay_fine', { p_id: tax.id })
    expect(await treasury('BOBO')).toBe(t + 321 + 123 + 123)
  })

  it('продажа квартиры: деньги продавцу, документ покупателю, прописка снимается', async () => {
    await expect(rpc(bob, 'offer_property', { p_doc: flat.id, p_to: alice.id, p_price: 1 })).rejects.toThrow('E_NOT_FOUND')
    const offer = await rpc(alice, 'offer_property', { p_doc: flat.id, p_to: bob.id, p_price: 1234 })
    const aliceBefore = await balance(alice)
    const bobBefore = await balance(bob)
    await expect(rpc(alice, 'respond_offer', { p_offer: offer.id, p_accept: true })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await rpc(bob, 'respond_offer', { p_offer: offer.id, p_accept: true })
    expect(await balance(alice)).toBe(aliceBefore + 1234)
    expect(await balance(bob)).toBe(bobBefore - 1234)
    const docs = await sql<{ user_id: string; revoked: boolean; last_name: string }>(
      `select user_id, revoked_at is not null as revoked, data ->> 'last_name' as last_name
       from documents where type = 'property' order by id`,
    )
    expect(docs).toEqual([
      { user_id: alice.id, revoked: true, last_name: 'Псянская' },
      { user_id: bob.id, revoked: false, last_name: 'Псянская' },
    ])
    const [p] = await sql<{ registered_address: string | null }>('select registered_address from profiles where id = $1', [alice.id])
    expect(p.registered_address).toBeNull()
  })
})

describe('суд', () => {
  let suit: number

  it('иск: пошлина в казну, возражение, заседание', async () => {
    const t = await treasury('BOBO')
    const r = await rpc(alice, 'file_lawsuit', { p_defendant: bob.id, p_amount: 1234, p_claim: 'Не вернул смуку' })
    suit = r.id!
    expect(await treasury('BOBO')).toBe(t + 123)
    await expect(rpc(alice, 'answer_lawsuit', { p_id: suit, p_defense: 'Не я' })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await rpc(bob, 'answer_lawsuit', { p_id: suit, p_defense: 'Смука была моя' })
    await expect(
      rpc(sshpPres, 'schedule_hearing', { p_id: suit, p_at: new Date().toISOString(), p_place: 'Суд' }),
    ).rejects.toThrow('E_FORBIDDEN_ACTION')
    await rpc(official, 'schedule_hearing', { p_id: suit, p_at: new Date(Date.now() + 3600e3).toISOString(), p_place: 'Псяленд, суд' })
    const { data } = await bob.client.from('lawsuits').select('status, defense').eq('id', suit)
    expect(data).toEqual([{ status: 'hearing', defense: 'Смука была моя' }])
  })

  it('решение: взыскание уходит истцу, а не в казну', async () => {
    await expect(rpc(official, 'decide_lawsuit', { p_id: suit, p_awarded: 99999, p_verdict: 'Много' })).rejects.toThrow('E_BAD_AMOUNT')
    await rpc(official, 'decide_lawsuit', { p_id: suit, p_awarded: 321, p_verdict: 'Вернуть 321 псякоин' })
    const [f] = await sql<{ id: number; beneficiary_id: string; kind: string }>(
      `select id::int, beneficiary_id, kind from fines where user_id = $1 and kind = 'court'`,
      [bob.id],
    )
    expect(f).toMatchObject({ beneficiary_id: alice.id, kind: 'court' })
    const { data: aliceSees } = await alice.client.from('fines').select('id').eq('id', f.id)
    expect(aliceSees).toHaveLength(1)

    await rpc(admin, 'grant_coins', { p_user: bob.id, p_amount: 1234 })
    const aliceBefore = await balance(alice)
    const t = await treasury('BOBO')
    await rpc(bob, 'pay_fine', { p_id: f.id })
    expect(await balance(alice)).toBe(aliceBefore + 321)
    expect(await treasury('BOBO')).toBe(t)
  })

  it('на себя в суд не подать', async () => {
    await expect(rpc(alice, 'file_lawsuit', { p_defendant: alice.id, p_amount: 1, p_claim: 'Я' })).rejects.toThrow('E_SELF')
  })
})

describe('помилование и амнистия', () => {
  it('президент милует, амнистия отменяет штрафы и публикует указ', async () => {
    const f1 = await rpc(official, 'issue_fine', { p_user: bob.id, p_amount: 123, p_reason: 'Раз' })
    await expect(rpc(sshpPres, 'pardon', { p_fine: f1.id })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await rpc(pres, 'pardon', { p_fine: f1.id })
    const [row] = await sql<{ status: string }>('select status from fines where id = $1', [f1.id])
    expect(row.status).toBe('cancelled')

    await rpc(official, 'issue_fine', { p_user: bob.id, p_amount: 123, p_reason: 'Два' })
    await rpc(official, 'issue_fine', { p_user: alice.id, p_amount: 321, p_reason: 'Три' })
    const r = await rpc<{ count: number; people: number; news_id: number }>(pres, 'amnesty', { p_country: 'BOBO' })
    expect(r).toMatchObject({ count: 2, people: 2 })
    const [news] = await sql<{ kind: string; title: string }>('select kind, title from news where id = $1', [r.news_id])
    expect(news).toEqual({ kind: 'decree', title: 'Об амнистии' })
    const unpaid = await sql(`select * from fines where country_code = 'BOBO' and status = 'unpaid' and kind = 'fine'`)
    expect(unpaid).toHaveLength(0)
  })
})
