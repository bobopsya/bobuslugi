import { beforeAll, describe, expect, it } from 'vitest'
import { anon, balance, resetDb, rpc, signUp, sql, type User } from './helpers'

let admin: User
let alice: User // гражданка Бобокаунтри
let bob: User // президент Бобокаунтри
let olga: User // чиновница СШП
let vasya: User // чиновник Бобокаунтри

async function approveCitizenship(user: User, country: string, reviewer: User) {
  const res = await rpc(user, 'submit_application', { p_service: 'citizenship', p_target: country, p_data: { city: 'Псяленд' } })
  expect(res.ok).toBe(true)
  const r = await rpc(reviewer, 'review_application', { p_id: res.id, p_decision: 'approve', p_comment: 'Сиф' })
  expect(r.ok).toBe(true)
}

beforeAll(async () => {
  await resetDb()
  admin = await signUp('admin', 'Главный Админ')
  alice = await signUp('alice', 'Алиса')
  bob = await signUp('bob', 'Боб')
  olga = await signUp('olga', 'Ольга')
  vasya = await signUp('vasya', 'Вася')
})

describe('регистрация', () => {
  it('первый пользователь — суперадмин, остальные — без гражданства', async () => {
    const rows = await sql<{ login: string; role: string; country_code: string | null }>(
      'select login, role, country_code from profiles order by created_at',
    )
    expect(rows[0]).toMatchObject({ login: 'admin', role: 'superadmin' })
    expect(rows.slice(1).every((r) => r.role === 'citizen' && r.country_code === null)).toBe(true)
  })

  it('проверяет логин и запрещённые слова', async () => {
    const a = anon()
    expect((await a.rpc('check_signup', { p_login: 'x', p_display_name: 'Икс' })).data).toBe('E_LOGIN_FORMAT')
    expect((await a.rpc('check_signup', { p_login: 'user52', p_display_name: 'Норм' })).data).toBe('E_FORBIDDEN_NAME')
    expect((await a.rpc('check_signup', { p_login: 'alice', p_display_name: 'Алиса 2' })).data).toBe('E_LOGIN_TAKEN')
    expect((await a.rpc('check_signup', { p_login: 'newbie', p_display_name: 'Новичок' })).data).toBeNull()
  })

  it('код-приглашение обязателен, если задан', async () => {
    await rpc(admin, 'admin_set_setting', { p_key: 'invite_code', p_value: 'ga1234' })
    const a = anon()
    expect((await a.rpc('invite_required')).data).toBe(true)
    expect((await a.rpc('check_signup', { p_login: 'stranger', p_display_name: 'Чужой' })).data).toBe('E_INVITE')
    await expect(signUp('stranger', 'Чужой', 'wrong')).rejects.toThrow()
    const ok = await signUp('friend', 'Друг', 'ga1234')
    expect(ok.id).toBeTruthy()
    await rpc(admin, 'admin_set_setting', { p_key: 'invite_code', p_value: '' })
  })

  it('гость не видит профили', async () => {
    const { data } = await anon().from('profiles').select('*')
    expect(data).toEqual([])
  })
})

describe('роли и гражданство', () => {
  beforeAll(async () => {
    await rpc(admin, 'admin_set_role', { p_user: bob.id, p_role: 'president', p_gov_country: 'BOBO' })
    await rpc(admin, 'admin_set_role', { p_user: olga.id, p_role: 'official', p_gov_country: 'SSHP' })
    await rpc(admin, 'admin_set_country', { p_user: bob.id, p_country: 'BOBO' })
  })

  it('гражданин не может вызывать админские функции', async () => {
    await expect(rpc(alice, 'admin_set_role', { p_user: alice.id, p_role: 'superadmin' })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await expect(rpc(alice, 'grant_coins', { p_user: alice.id, p_amount: 1234 })).rejects.toThrow('E_FORBIDDEN_ACTION')
  })

  it('прямая запись в таблицы запрещена', async () => {
    const { error } = await alice.client.from('profiles').update({ balance: 4321 }).eq('id', alice.id)
    expect(error).not.toBeNull()
    expect(await balance(alice)).toBe(0)
  })

  it('без гражданства нельзя подать на загранпаспорт', async () => {
    await expect(rpc(alice, 'submit_application', { p_service: 'intl_passport' })).rejects.toThrow('E_NOT_CITIZEN')
  })

  it('заявление на гражданство видит и рассматривает только своя страна', async () => {
    const res = await rpc(alice, 'submit_application', {
      p_service: 'citizenship',
      p_target: 'BOBO',
      p_data: { city: 'Псяленд', reason: 'Хочу быть сляйнером' },
    })
    expect(res.ok).toBe(true)

    const { data: olgaSees } = await olga.client.from('applications').select('id').eq('id', res.id!)
    expect(olgaSees).toEqual([])
    await expect(rpc(olga, 'review_application', { p_id: res.id, p_decision: 'approve' })).rejects.toThrow('E_FORBIDDEN_ACTION')

    const notif = await sql('select * from notifications where user_id = $1 and kind = $2', [bob.id, 'app_new'])
    expect(notif.length).toBe(1)

    await rpc(bob, 'review_application', { p_id: res.id, p_decision: 'approve', p_comment: 'Кси, сляйнер!' })
    const [p] = await sql<{ country_code: string; city: string }>('select country_code, city from profiles where id = $1', [alice.id])
    expect(p).toMatchObject({ country_code: 'BOBO', city: 'Псяленд' })
    const docs = await sql<{ type: string; number: string }>('select type, number from documents where user_id = $1', [alice.id])
    expect(docs).toHaveLength(1)
    expect(docs[0].type).toBe('passport')
    expect(docs[0].number).toMatch(/^((123|321|1234|4321) ){5}(123|321|1234|4321)$/)
  })

  it('повторно подать на гражданство нельзя', async () => {
    await expect(
      rpc(alice, 'submit_application', { p_service: 'citizenship', p_target: 'SSHP', p_data: {} }),
    ).rejects.toThrow('E_ALREADY_CITIZEN')
  })

  it('президент назначает чиновника', async () => {
    await approveCitizenship(vasya, 'BOBO', bob)
    await rpc(bob, 'president_set_official', { p_user: vasya.id, p_on: true })
    const [p] = await sql<{ role: string; gov_country_code: string }>('select role, gov_country_code from profiles where id = $1', [vasya.id])
    expect(p).toMatchObject({ role: 'official', gov_country_code: 'BOBO' })
  })

  it('чиновник не видит письма президенту', async () => {
    const res = await rpc(alice, 'submit_application', {
      p_service: 'letter_president',
      p_data: { subject: 'Дороги', text: 'Сделайте дороги в Псярфино, пеж' },
    })
    const { data } = await vasya.client.from('applications').select('id').eq('id', res.id!)
    expect(data).toEqual([])
    await expect(rpc(vasya, 'review_application', { p_id: res.id, p_decision: 'approve' })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await rpc(bob, 'review_application', { p_id: res.id, p_decision: 'approve', p_comment: 'Сапс, сделаем' })
  })
})

describe('псякоины и пошлины', () => {
  it('без денег платная услуга не подаётся и заявление не создаётся', async () => {
    await expect(rpc(alice, 'submit_application', { p_service: 'intl_passport' })).rejects.toThrow('E_NO_MONEY')
    const rows = await sql('select * from applications where user_id = $1 and service_code = $2', [alice.id, 'intl_passport'])
    expect(rows).toHaveLength(0)
  })

  it('президент выдаёт псякоины только своим гражданам', async () => {
    await rpc(bob, 'grant_coins', { p_user: alice.id, p_amount: 1234, p_comment: 'Пособие' })
    expect(await balance(alice)).toBe(1234)
    await expect(rpc(bob, 'grant_coins', { p_user: olga.id, p_amount: 123 })).rejects.toThrow('E_FORBIDDEN_ACTION')
    await expect(rpc(bob, 'grant_coins', { p_user: alice.id, p_amount: -123 })).rejects.toThrow('E_FORBIDDEN_ACTION')
  })

  it('пошлина списывается при подаче и возвращается при отказе', async () => {
    const res = await rpc(alice, 'submit_application', { p_service: 'intl_passport' })
    expect(await balance(alice)).toBe(1234 - 123)
    await rpc(vasya, 'review_application', { p_id: res.id, p_decision: 'reject', p_comment: 'Фото не то' })
    expect(await balance(alice)).toBe(1234)
    const tx = await sql<{ type: string }>('select type from transactions where user_id = $1 order by id', [alice.id])
    expect(tx.map((t) => t.type)).toEqual(['grant', 'fee', 'refund'])
  })

  it('отмена заявления возвращает пошлину', async () => {
    const res = await rpc(alice, 'submit_application', { p_service: 'intl_passport' })
    await expect(rpc(alice, 'submit_application', { p_service: 'intl_passport' })).rejects.toThrow('E_DUPLICATE')
    await rpc(alice, 'cancel_application', { p_id: res.id })
    expect(await balance(alice)).toBe(1234)
  })

  it('админ не может увести баланс в минус', async () => {
    await expect(rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: -99999 })).rejects.toThrow('E_NO_MONEY')
  })
})

describe('документы и переезд', () => {
  it('загранпаспорт → виза → Мигрантское окно', async () => {
    await rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: 4321 })
    const ip = await rpc(alice, 'submit_application', { p_service: 'intl_passport' })
    await rpc(vasya, 'review_application', { p_id: ip.id, p_decision: 'approve' })

    await expect(rpc(alice, 'submit_application', { p_service: 'migrant_window', p_data: {} })).rejects.toThrow('E_NEED_VISA')
    await expect(rpc(alice, 'submit_application', { p_service: 'visa', p_target: 'BOBO' })).rejects.toThrow('E_SAME_COUNTRY')

    const visa = await rpc(alice, 'submit_application', { p_service: 'visa', p_target: 'BOBOSTAN', p_data: { purpose: 'Посмотреть окно' } })
    await rpc(admin, 'review_application', { p_id: visa.id, p_decision: 'approve' })
    const docs = await sql<{ type: string; country_code: string }>(
      'select type, country_code from documents where user_id = $1 and revoked_at is null order by id',
      [alice.id],
    )
    expect(docs.map((d) => `${d.type}:${d.country_code}`)).toEqual(['passport:BOBO', 'intl_passport:BOBO', 'visa:BOBOSTAN'])

    const mw = await rpc(alice, 'submit_application', { p_service: 'migrant_window', p_data: { reason: 'Интересно' } })
    expect(mw.ok).toBe(true)
  })

  it('запрос уточнений и ответ заявителя', async () => {
    const res = await rpc(alice, 'submit_application', { p_service: 'driver_license', p_data: { category: 'Гармод-джип' } })
    await expect(rpc(vasya, 'review_application', { p_id: res.id, p_decision: 'needs_info' })).rejects.toThrow('E_COMMENT_REQUIRED')
    await rpc(vasya, 'review_application', { p_id: res.id, p_decision: 'needs_info', p_comment: 'Какой стаж?' })
    await rpc(alice, 'update_application', { p_id: res.id, p_data: { reply: '1234 часа в Гармоде' } })
    await rpc(vasya, 'review_application', { p_id: res.id, p_decision: 'approve' })
    const [d] = await sql<{ data: { category: string } }>(
      `select data from documents where user_id = $1 and type = 'driver_license'`,
      [alice.id],
    )
    expect(d.data.category).toBe('Гармод-джип')
  })

  it('смена гражданства аннулирует старые документы', async () => {
    await rpc(admin, 'grant_coins', { p_user: vasya.id, p_amount: 1234 })
    const res = await rpc(vasya, 'submit_application', { p_service: 'change_citizenship', p_target: 'SSHP', p_data: { city: 'Псю-йорк' } })
    await rpc(olga, 'review_application', { p_id: res.id, p_decision: 'approve' })
    const [p] = await sql<{ country_code: string; role: string; gov_country_code: string | null }>(
      'select country_code, role, gov_country_code from profiles where id = $1',
      [vasya.id],
    )
    expect(p).toMatchObject({ country_code: 'SSHP', role: 'citizen', gov_country_code: null })
    const active = await sql<{ country_code: string }>(
      `select country_code from documents where user_id = $1 and type = 'passport' and revoked_at is null`,
      [vasya.id],
    )
    expect(active.map((d) => d.country_code)).toEqual(['SSHP'])
  })
})

describe('запрещённые слова и числа', () => {
  const bad = ['52', 'мне 5 2 года', '1.4.8.8', '6-7', 'ответ 42', 'Свастон', 'свaстoн', 'с в а с т о н', 'СВАСТ0Н']
  const good = ['123', '321', '1234', '4321', '12.34.1234', '123+123=321', '1234 4321 321 123', 'Кси, сас дела? Га гул']

  it.each(bad)('«%s» блокируется', async (text) => {
    const [row] = await sql<{ f: boolean }>('select private.is_forbidden($1) as f', [text])
    expect(row.f).toBe(true)
  })

  it.each(good)('«%s» проходит', async (text) => {
    const [row] = await sql<{ f: boolean }>('select private.is_forbidden($1) as f', [text])
    expect(row.f).toBe(false)
  })

  it('заявление с запрещённым числом не создаётся, а приходит автоштраф', async () => {
    const before = await sql('select * from applications where user_id = $1', [alice.id])
    const res = await rpc(alice, 'submit_application', {
      p_service: 'letter_president',
      p_data: { subject: 'Вопрос', text: 'Сколько будет 5+2? Ответ: 52' },
    })
    expect(res).toEqual({ ok: false, error: 'E_FORBIDDEN' })
    const after = await sql('select * from applications where user_id = $1', [alice.id])
    expect(after.length).toBe(before.length)
    const fines = await sql<{ kind: string; amount: number }>(
      `select kind, amount from fines where user_id = $1 and kind = 'auto_forbidden'`,
      [alice.id],
    )
    expect(fines).toEqual([{ kind: 'auto_forbidden', amount: 123 }])
  })

  it('чиновника тоже штрафуют за запрещённый комментарий', async () => {
    const res = await rpc(alice, 'submit_application', { p_service: 'gang_complaint', p_data: { gang: 'Балсас', text: 'Шумят' } })
    const r = await rpc(bob, 'review_application', { p_id: res.id, p_decision: 'approve', p_comment: '67' })
    expect(r).toEqual({ ok: false, error: 'E_FORBIDDEN' })
    const [app] = await sql<{ status: string }>('select status from applications where id = $1', [res.id])
    expect(app.status).toBe('submitted')
    const fines = await sql(`select * from fines where user_id = $1 and kind = 'auto_forbidden'`, [bob.id])
    expect(fines).toHaveLength(1)
  })
})

describe('штрафы, розыск, новости', () => {
  it('чиновник выписывает штраф, гражданин оплачивает', async () => {
    const f = await rpc(bob, 'issue_fine', { p_user: alice.id, p_amount: 321, p_reason: 'Езда без прав в Гармоде' })
    const { data: debtors } = await alice.client.rpc('debtors')
    expect((debtors as { login: string }[]).some((d) => d.login === 'alice')).toBe(true)

    const before = await balance(alice)
    await rpc(alice, 'pay_fine', { p_id: f.id })
    expect(await balance(alice)).toBe(before - 321)
    await expect(rpc(alice, 'pay_fine', { p_id: f.id })).rejects.toThrow('E_BAD_STATUS')
  })

  it('гражданин не может выписать штраф', async () => {
    await expect(rpc(alice, 'issue_fine', { p_user: bob.id, p_amount: 123, p_reason: 'Просто так' })).rejects.toThrow(
      'E_FORBIDDEN_ACTION',
    )
  })

  it('чужие штрафы не видны', async () => {
    const { data } = await olga.client.from('fines').select('*').eq('user_id', alice.id)
    expect(data).toEqual([])
  })

  it('розыск банды', async () => {
    const w = await rpc(bob, 'wanted_create', { p_name: 'Банда Балсас', p_description: 'Орудует в Псярфино', p_reward: 1234 })
    const { data } = await anon().from('wanted').select('name, country_code').eq('id', w.id!)
    expect(data).toEqual([{ name: 'Банда Балсас', country_code: 'BOBO' }])
  })

  it('указ президента рассылает уведомления гражданам', async () => {
    await expect(rpc(vasya, 'post_news', { p_kind: 'decree', p_title: 'Указ', p_body: 'Текст' })).rejects.toThrow()
    const res = await rpc(bob, 'post_news', { p_kind: 'decree', p_title: 'Указ №1234', p_body: 'Всем сиф' })
    const n = await sql('select * from notifications where user_id = $1 and kind = $2', [alice.id, 'decree'])
    expect(n).toHaveLength(1)
    const { data } = await anon().from('news').select('title').eq('id', res.id!)
    expect(data).toEqual([{ title: 'Указ №1234' }])
  })

  it('уведомления отмечаются прочитанными', async () => {
    await rpc(alice, 'mark_notifications_read', {})
    const { data } = await alice.client.from('notifications').select('id').is('read_at', null)
    expect(data).toEqual([])
  })
})

describe('выборы', () => {
  let electionId: number
  let c1: number
  let c2: number

  it('президент создаёт выборы и добавляет кандидатов', async () => {
    const e = await rpc(bob, 'create_election', { p_title: 'Выборы президента Бобокаунтри', p_description: 'Раз в 1234 года' })
    electionId = e.id!
    c1 = (await rpc(bob, 'add_candidate', { p_election: electionId, p_user: bob.id, p_name: null, p_program: 'Стабильность' })).id!
    await expect(rpc(bob, 'set_election_status', { p_id: electionId, p_status: 'open' })).rejects.toThrow('E_FEW_CANDIDATES')
    c2 = (await rpc(bob, 'add_candidate', { p_election: electionId, p_user: alice.id, p_name: null, p_program: 'Перемены' })).id!
    await rpc(bob, 'set_election_status', { p_id: electionId, p_status: 'open' })
  })

  it('голосуют только граждане и только один раз; итоги скрыты до закрытия', async () => {
    await rpc(alice, 'vote', { p_election: electionId, p_candidate: c2 })
    await expect(rpc(alice, 'vote', { p_election: electionId, p_candidate: c1 })).rejects.toThrow('E_ALREADY_VOTED')
    await expect(rpc(olga, 'vote', { p_election: electionId, p_candidate: c1 })).rejects.toThrow('E_NOT_CITIZEN')
    await expect(rpc(alice, 'election_results', { p_id: electionId })).rejects.toThrow('E_RESULTS_HIDDEN')

    await rpc(bob, 'vote', { p_election: electionId, p_candidate: c2 })
    await rpc(bob, 'set_election_status', { p_id: electionId, p_status: 'closed' })
    const results = await rpc<{ candidate_id: number; votes: number }[]>(alice, 'election_results', { p_id: electionId })
    expect(results[0]).toEqual({ candidate_id: c2, votes: 2 })
  })
})

describe('бан', () => {
  it('забаненный не может ничего делать', async () => {
    await rpc(admin, 'admin_set_banned', { p_user: olga.id, p_banned: true })
    await expect(rpc(olga, 'mark_notifications_read', {})).rejects.toThrow('E_BANNED')
    await expect(rpc(admin, 'admin_set_banned', { p_user: admin.id, p_banned: true })).rejects.toThrow('E_SELF')
  })
})
