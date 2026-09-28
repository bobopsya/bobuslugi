import { expect, test, type Browser, type Page } from '@playwright/test'
import { resetDb } from '../db/helpers'

async function register(browser: Browser, login: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto('/#/register')
  await page.fill('input[name=login]', login)
  await page.fill('input[name=displayName]', name)
  await page.fill('input[name=password]', 'password1234')
  await page.fill('input[name=password2]', 'password1234')
  await page.click('button[type=submit]')
  await expect(page.getByText(`Кси, ${name}!`)).toBeVisible()
  return page
}

test.beforeAll(async () => {
  await resetDb()
})

test('гражданство, документы, псякоины, штрафы и псянский язык', async ({ browser }) => {
  const admin = await register(browser, 'admin', 'Админ')
  const alice = await register(browser, 'alice', 'Алиса')

  // Алиса без гражданства подаёт заявление
  await expect(alice.getByText('У вас пока нет гражданства')).toBeVisible()
  await alice.getByRole('link', { name: 'Получить гражданство' }).click()
  await alice.selectOption('select[name=target]', 'BOBO')
  await alice.selectOption('select[name=city]', 'Псябург')
  await alice.fill('textarea[name=reason]', 'Хочу быть сляйнером')
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByTestId('applied')).toBeVisible()

  // Админ одобряет в госслужбе
  await admin.goto('/#/gov')
  await admin.getByTestId('application-row').first().click()
  await admin.fill('textarea[name=comment]', 'Добро пожаловать!')
  await admin.getByRole('button', { name: 'Одобрить' }).click()
  await expect(admin.getByText('Одобрено')).toBeVisible()

  // У Алисы появился паспорт и уведомление
  await alice.goto('/#/cabinet/documents')
  await expect(alice.getByTestId('doc-passport')).toBeVisible()
  await expect(alice.getByTestId('unread-count')).toBeVisible()

  // Без денег загранпаспорт не оформить
  await alice.goto('/#/services/intl_passport')
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByRole('alert')).toHaveText('Не хватает псякоинов')

  // Админ выдаёт псякоины
  await admin.goto('/#/admin')
  const row = admin.locator('div', { has: admin.getByText('@alice') }).filter({ has: admin.getByRole('button', { name: 'Выдать псякоины' }) }).last()
  await row.locator('input[type=number]').fill('1234')
  await row.getByRole('button', { name: 'Выдать псякоины' }).click()
  await expect(row.getByText('1 234 псякоина')).toBeVisible()

  await alice.reload()
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByTestId('applied')).toBeVisible()
  await alice.goto('/#/cabinet/wallet')
  await expect(alice.getByTestId('wallet-balance')).toHaveText('1 111 псякоинов')

  // Запрещённое число — автоштраф
  await alice.goto('/#/services/letter_president')
  await alice.fill('input[name=subject]', 'Вопрос')
  await alice.fill('textarea[name=text]', 'Почему нельзя писать 5 2?')
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByRole('alert')).toContainText('Запрещённое слово или число')
  await alice.goto('/#/cabinet/fines')
  await expect(alice.getByTestId('fine-row')).toHaveCount(1)
  await alice.getByRole('button', { name: 'Оплатить' }).click()
  await expect(alice.getByText('Оплачен', { exact: true })).toBeVisible()

  // Псянский режим: лорная дата и числа
  await alice.getByRole('button', { name: 'Пся' }).click()
  await alice.goto('/#/cabinet/wallet')
  await expect(alice.getByText('Смука с псякоинами').first()).toBeVisible()
  await expect(alice.getByText('12.34.1234').first()).toBeVisible()
  const psyBalance = await alice.getByTestId('wallet-balance').textContent()
  expect(psyBalance).toMatch(/^(123|321|1234|4321) псякоин/)
})

test('гость не попадает в кабинет и госслужбу', async ({ page }) => {
  await page.goto('/#/cabinet')
  await expect(page).toHaveURL(/#\/login/)
  await page.goto('/#/gov')
  await expect(page).toHaveURL(/#\/login/)
})
