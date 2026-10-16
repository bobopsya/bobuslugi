import { beforeAll, describe, expect, it } from 'vitest'
import { approveAndReceive, balance, getCitizenship, resetDb, rpc, setSignature, signUp, sql, svc, type User } from './helpers'

let admin: User
let pres: User // президент Бобокаунтри
let official: User
let alice: User // гражданка с бизнесом
let bob: User // без паспорта

type Person = {
  id: string
  login: string
  passport: { number: string; last_name: string; first_name: string; birth_date: string } | null
  businesses: { id: number; inn: string; name: string; org_type: string }[]
}

async function linkBank(u: User) {
  const { code } = await rpc<{ code: string }>(u, 'create_link_code', { p_client: 'bank' })
  return svc<Person>('svc_redeem_code', { p_code: code, p_client: 'bank' })
}

async function getDoc(u: User, service: string, data: Record<string, string>) {
  const app = await rpc(u, 'submit_application', { p_service: service, p_data: data })
  await approveAndReceive(u, app.id!, official)
  const [doc] = await sql<{ id: number; number: string; data: Record<string, string> }>(
    'select id::int, number, data from documents where application_id = $1',
    [app.id],
  )
  return doc
}

beforeAll(async () => {
  await resetDb()
  admin = await signUp('admin', 'Админ')
  pres = await signUp('pres', 'Президент')
  official = await signUp('official', 'Чиновник')
  alice = await signUp('alice', 'Алиса')
  bob = await signUp('bob', 'Боб')
  await rpc(admin, 'admin_set_role', { p_user: pres.id, p_role: 'president', p_gov_country: 'BOBO' })
  await rpc(admin, 'admin_set_country', { p_user: pres.id, p_country: 'BOBO' })
  await rpc(admin, 'admin_set_role', { p_user: official.id, p_role: 'official', p_gov_country: 'BOBO' })
  for (const u of [admin, pres, official]) await setSignature(u)
  await getCitizenship(alice, 'BOBO', official)
})

describe('вход через Бобуслуги', () => {
  it('код одноразовый, отдаёт паспорт и бизнесы с ИНН из лорных цифр', async () => {
    await rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: 4321, p_comment: 'Старт' })
    const ip = await getDoc(alice, 'business_registration', { name: 'Бобо-кофе', org_type: 'ИП', activity: 'Кофейня' })
    const co = await getDoc(alice, 'business_registration', { name: 'Псяфлот', org_type: 'Компания', activity: 'Перевозки' })
    expect(ip.data.inn).toMatch(/^\d{12}$/)
    expect(co.data.inn).toMatch(/^\d{10}$/)
    for (const inn of [ip.data.inn, co.data.inn]) expect(inn).not.toMatch(/52|1488|67|42/)

    const { code } = await rpc<{ code: string }>(alice, 'create_link_code', { p_client: 'bank' })
    const p = await svc<Person>('svc_redeem_code', { p_code: code, p_client: 'bank' })
    expect(p).toMatchObject({ id: alice.id, login: 'alice', passport: { last_name: 'Псянская', birth_date: '2010-05-24' } })
    expect(p.businesses.map((b) => b.inn).sort()).toEqual([ip.data.inn, co.data.inn].sort())
    await expect(svc('svc_redeem_code', { p_code: code, p_client: 'bank' })).rejects.toThrow('E_BAD_CODE')
    // Код для GPAY не подходит банку.
    const g = await rpc<{ code: string }>(alice, 'create_link_code', { p_client: 'gpay' })
    await expect(svc('svc_redeem_code', { p_code: g.code, p_client: 'bank' })).rejects.toThrow('E_BAD_CODE')
    const [link] = await sql<{ bank_linked_at: string | null }>('select bank_linked_at from bank_links where user_id = $1', [alice.id])
    expect(link.bank_linked_at).not.toBeNull()
  })

  it('просроченный код не работает, у человека без паспорта passport = null', async () => {
    const { code } = await rpc<{ code: string }>(bob, 'create_link_code', { p_client: 'bank' })
    await sql(`update link_codes set expires_at = now() - interval '1 second' where user_id = $1`, [bob.id])
    await expect(svc('svc_redeem_code', { p_code: code, p_client: 'bank' })).rejects.toThrow('E_BAD_CODE')
    const p = await linkBank(bob)
    expect(p.passport).toBeNull()
  })

  it('функции svc_* недоступны пользователям', async () => {
    await expect(rpc(alice, 'svc_person', { p_user: alice.id })).rejects.toThrow()
    await expect(rpc(alice, 'svc_exchange', { p_user: alice.id, p_coins: 1000, p_op: 'x', p_rub: 1 })).rejects.toThrow()
    const [row] = await sql<{ balance: number }>('select balance from profiles where id = $1', [alice.id])
    expect(row.balance).toBe(4321 - 321 * 2)
  })
})

describe('штрафы и арест', () => {
  it('штраф оплачивается рублями через банк, повтор не ломает', async () => {
    const f = await rpc(official, 'issue_fine', { p_user: alice.id, p_amount: 123, p_reason: 'Парковка' })
    const info = await svc<{ amount: number; amount_rub: number; status: string }>('svc_fine', { p_id: f.id })
    expect(info).toMatchObject({ amount: 123, amount_rub: 123 * 10000, status: 'unpaid' })
    await svc('svc_fine_paid', { p_id: f.id, p_op: 'op1', p_rub: 1230000 })
    expect(await svc('svc_fine_paid', { p_id: f.id, p_op: 'op1', p_rub: 1230000 })).toMatchObject({ repeat: true })
    await expect(svc('svc_fine_paid', { p_id: f.id, p_op: 'op2', p_rub: 1 })).rejects.toThrow('E_BAD_STATUS')
    const [row] = await sql<{ status: string; paid_via: string }>('select status, paid_via from fines where id = $1', [f.id])
    expect(row).toEqual({ status: 'paid', paid_via: 'bank' })
  })

  it('арест: только с банком, по поручению; после оплаты штрафа — поручение снять арест', async () => {
    const fb = await rpc(official, 'issue_fine', { p_user: bob.id, p_amount: 321, p_reason: 'Шум' })
    await sql('delete from bank_links where user_id = $1', [bob.id])
    await expect(rpc(official, 'request_arrest', { p_fine: fb.id })).rejects.toThrow('E_NO_BANK')
    await expect(rpc(alice, 'request_arrest', { p_fine: fb.id })).rejects.toThrow('E_FORBIDDEN_ACTION')

    const f = await rpc(official, 'issue_fine', { p_user: alice.id, p_amount: 321, p_reason: 'Долг' })
    await rpc(official, 'request_arrest', { p_fine: f.id })
    await expect(rpc(official, 'request_arrest', { p_fine: f.id })).rejects.toThrow('E_ALREADY')
    const orders = await svc<{ id: number; type: string; amount_rub: number; user_id: string }[]>('svc_pull_orders', { p_limit: 10 })
    expect(orders).toEqual([expect.objectContaining({ type: 'arrest', user_id: alice.id, amount_rub: 321 * 10000 })])
    expect(await svc('svc_pull_orders', {})).toEqual([])
    await svc('svc_order_done', { p_id: orders[0].id, p_ok: true, p_result: { restriction: 7 } })

    await rpc(alice, 'pay_fine', { p_id: f.id })
    const lift = await svc<{ type: string; fine_id: number }[]>('svc_pull_orders', {})
    expect(lift).toEqual([expect.objectContaining({ type: 'lift', fine_id: f.id })])
  })
})

describe('обмен псякоинов', () => {
  it('списывает и зачисляет, повтор по op_id не задваивает, отмена возвращает', async () => {
    const before = await balance(alice)
    await svc('svc_exchange', { p_user: alice.id, p_coins: -100, p_op: 'ex1', p_rub: 990000 })
    await svc('svc_exchange', { p_user: alice.id, p_coins: -100, p_op: 'ex1', p_rub: 990000 })
    expect(await balance(alice)).toBe(before - 100)
    await expect(svc('svc_exchange', { p_user: alice.id, p_coins: -1_000_000, p_op: 'ex2', p_rub: 1 })).rejects.toThrow('E_NO_MONEY')
    await svc('svc_exchange_revert', { p_op: 'ex1' })
    expect(await balance(alice)).toBe(before)
    await svc('svc_exchange', { p_user: alice.id, p_coins: 50, p_op: 'ex3', p_rub: 505000 })
    expect(await balance(alice)).toBe(before + 50)
  })
})

describe('зарплаты из банка и налог с оборота', () => {
  it('зарплаты из банка — поручения только тем, у кого есть банк', async () => {
    await rpc(pres, 'set_salary', { p_user: official.id, p_amount: 123 })
    await rpc(pres, 'set_salary', { p_user: pres.id, p_amount: 321 })
    await linkBank(official)
    const r = await rpc<{ count: number; skipped: number }>(pres, 'pay_salaries', { p_country: 'BOBO', p_source: 'bank' })
    expect(r).toMatchObject({ count: 1, skipped: 1 })
    const orders = await svc<{ type: string; user_id: string; amount_rub: number }[]>('svc_pull_orders', {})
    expect(orders).toEqual([expect.objectContaining({ type: 'salary', user_id: official.id, amount_rub: 123 * 10000 })])
  })

  it('магазин GPAY привязывается к бизнесу, оборот облагается налогом', async () => {
    const [doc] = await sql<{ id: number }>(`select id::int from documents where user_id = $1 and type::text = 'business_reg' order by id limit 1`, [alice.id])
    await expect(svc('svc_gpay_shop', { p_shop: 412038, p_user: bob.id, p_doc: doc.id, p_name: 'Чужой' })).rejects.toThrow('E_NOT_FOUND')
    const linked = await svc<{ document: { inn: string } }>('svc_gpay_shop', { p_shop: 412038, p_user: alice.id, p_doc: doc.id, p_name: 'Бобо-кофе', p_site: 'bobo.coffee' })
    expect(linked.document.inn).toMatch(/^\d{12}$/)
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
    await svc('svc_gpay_turnover', { p_shop: 412038, p_day: yesterday, p_day_rub: 5_000_000_00, p_month_rub: 7_000_000_00 })
    await rpc(pres, 'set_country_taxes', { p_country: 'BOBO', p_business_tax: 0, p_property_tax: 0, p_turnover_tax: 2 })
    await rpc(pres, 'collect_taxes', { p_country: 'BOBO' })
    const fines = await sql<{ amount: number; reason: string }>(`select amount, reason from fines where user_id = $1 and reason like 'Налог с оборота%'`, [alice.id])
    // 5 000 000 ₽ × 2 % = 100 000 ₽ = 1000 псякоинов по курсу 100 ₽
    expect(fines).toEqual([{ amount: 1000, reason: expect.stringContaining('Бобо-кофе') }])
    await rpc(pres, 'collect_taxes', { p_country: 'BOBO' })
    expect((await sql(`select 1 from fines where reason like 'Налог с оборота%'`)).length).toBe(1)
    const shops = await alice.client.from('gpay_shops').select('shop_id, turnover_30d')
    expect(shops.data).toEqual([{ shop_id: 412038, turnover_30d: 7_000_000_00 }])
  })

  it('Бобтелеком: вход через Бобуслуги и номер в кабинете — виден только владельцу', async () => {
    const { code } = await rpc<{ code: string }>(alice, 'create_link_code', { p_client: 'telecom' })
    await expect(svc('svc_redeem_code', { p_code: code, p_client: 'bank' })).rejects.toThrow('E_BAD_CODE')
    const person = await svc<Person>('svc_redeem_code', { p_code: code, p_client: 'telecom' })
    expect(person.passport?.last_name).toBeTruthy()
    await expect(svc('svc_set_phone', { p_user: alice.id, p_number: '79991234567' })).rejects.toThrow('E_BAD_DATA')
    await svc('svc_set_phone', { p_user: alice.id, p_number: '1239041888800' })
    expect((await alice.client.from('phone_numbers').select('number')).data).toEqual([{ number: '1239041888800' }])
    expect((await bob.client.from('phone_numbers').select('number')).data).toEqual([])
    const [n] = await sql<{ params: { number: string } }>(`select params from notifications where user_id = $1 and kind = 'phone_linked'`, [alice.id])
    expect(n.params.number).toBe('+123 904 188-88-00')
    // The number went to Bob: Alice loses it; closing the contract removes it.
    await svc('svc_set_phone', { p_user: bob.id, p_number: '1239041888800' })
    expect((await alice.client.from('phone_numbers').select('number')).data).toEqual([])
    await svc('svc_set_phone', { p_user: bob.id, p_number: null })
    expect((await bob.client.from('phone_numbers').select('number')).data).toEqual([])
    await expect(rpc(alice, 'svc_set_phone', { p_user: alice.id, p_number: '1239990000000' })).rejects.toThrow()
  })
})
