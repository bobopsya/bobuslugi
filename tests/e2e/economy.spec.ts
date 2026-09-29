import { expect, test, type Browser, type Page } from '@playwright/test'
import { getCitizenship, resetDb, rpc, setSignature, signUp, sql } from '../db/helpers'

async function login(browser: Browser, loginName: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
  page.on('dialog', (d) => d.accept())
  await page.goto('/#/login')
  await page.fill('input[name=login]', loginName)
  await page.fill('input[name=password]', 'password1234')
  await page.click('button[type=submit]')
  await page.waitForURL(/cabinet/)
  return page
}

async function sign(page: Page) {
  const pad = page.getByTestId('signature-pad').first()
  await pad.scrollIntoViewIfNeeded()
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 20, box.y + box.height / 2 + (i % 2 ? -20 : 20))
  await page.mouse.up()
}

test('население, казна, зарплаты, машина с госномером и суд', async ({ browser }) => {
  test.setTimeout(120_000)
  await resetDb()
  await sql('update countries set population_bonus = 0, treasury = 0')
  const admin = await signUp('admin', 'Админ')
  const pres = await signUp('pres', 'Псянский')
  const alice = await signUp('alice', 'Алиса')
  const bob = await signUp('bob', 'Боб')
  await rpc(admin, 'admin_set_role', { p_user: pres.id, p_role: 'president', p_gov_country: 'BOBO' })
  await rpc(admin, 'admin_set_country', { p_user: pres.id, p_country: 'BOBO' })
  await setSignature(pres)
  await setSignature(admin)
  await getCitizenship(alice, 'BOBO', pres)
  await getCitizenship(bob, 'BOBO', pres)
  await rpc(admin, 'admin_treasury', { p_country: 'BOBO', p_amount: 4321 })
  await rpc(admin, 'grant_coins', { p_user: alice.id, p_amount: 1234 })

  // Президент накручивает население и платит себе зарплату из казны
  const p = await login(browser, 'pres')
  await p.goto('/#/gov')
  await p.getByRole('button', { name: 'Казна' }).click()
  await expect(p.getByTestId('population')).toHaveText('3')
  await p.getByRole('button', { name: '+1 234' }).click()
  await expect(p.getByTestId('population')).toHaveText('1 237')
  await p.getByLabel('Оклад').fill('1234')
  await p.getByRole('button', { name: 'Сохранить' }).first().click()
  await expect(p.getByText('Фонд оплаты труда: 1 234 псякоина')).toBeVisible()
  await p.getByRole('button', { name: /Выплатить зарплаты/ }).click()
  await expect(p.getByText('Зарплаты выплачены!')).toBeVisible()
  await expect(p.getByTestId('treasury')).toHaveText('3 087 псякоинов')

  // Рейтинг стран виден всем
  await p.goto('/#/countries')
  await expect(p.getByTestId('ranking-row').first()).toContainText('Бобокаунтри')

  // Алиса регистрирует машину
  const a = await login(browser, 'alice')
  await a.goto('/#/services/vehicle_registration')
  await a.fill('input[name=brand]', 'Бобомобиль')
  await a.fill('input[name=model]', 'Пупа')
  await a.fill('input[name=color]', 'Синий')
  await a.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(a.getByTestId('applied')).toBeVisible()
  const [app] = await sql<{ id: number }>(`select id::int from applications where service_code = 'vehicle_registration'`)
  await rpc(pres, 'review_application', { p_id: app.id, p_decision: 'approve' })
  await rpc(pres, 'speed_up_production', { p_app: app.id })
  await a.goto(`/#/cabinet/applications/${app.id}`)
  await sign(a)
  await a.getByRole('button', { name: 'Получить документ' }).click()
  await expect(a.getByText(/Документ выдан/)).toBeVisible()
  await a.goto('/#/cabinet/property')
  await expect(a.getByTestId('doc-vehicle').getByTestId('doc-number')).toHaveText(/^[А-Я] (123|321|1234|4321) [А-Я]{2} (123|321)$/)

  // Суд: Алиса подаёт иск, президент судит
  await a.goto('/#/court')
  await a.selectOption('select[name=defendant]', { label: 'Боб (@bob)' })
  await a.fill('input[name=amount]', '321')
  await a.fill('textarea[name=claim]', 'Не вернул смуку')
  await a.getByRole('button', { name: 'Подать иск' }).last().click()
  await expect(a.getByText('Дело №1')).toBeVisible()

  await p.goto('/#/court/1')
  await p.fill('input[name=hearingAt]', '2030-01-01T12:00')
  await p.fill('input[name=place]', 'Псяленд, суд, зал 123')
  await p.getByRole('button', { name: /Назначить заседание/ }).click()
  await expect(p.getByText('Заседание назначено')).toBeVisible()
  await p.fill('input[name=awarded]', '321')
  await p.fill('textarea[name=verdict]', 'Вернуть смуку деньгами')
  await p.getByRole('button', { name: /Вынести решение/ }).click()
  await expect(p.getByTestId('verdict')).toContainText('Вернуть смуку деньгами')

  await a.reload()
  await expect(a.getByTestId('verdict')).toContainText('Взыскано: 321 псякоин')
  const [download] = await Promise.all([a.waitForEvent('download'), a.getByRole('button', { name: 'Решение суда (PDF)' }).click()])
  expect(download.suggestedFilename()).toBe('Reshenie_suda_1.pdf')
})
