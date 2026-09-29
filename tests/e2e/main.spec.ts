import { expect, test, type Browser, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resetDb, sql } from '../db/helpers'

async function register(browser: Browser, login: string, name: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage()
  await page.goto('/#/register')
  await page.fill('input[name=login]', login)
  await page.fill('input[name=displayName]', name)
  await page.fill('input[name=password]', 'password1234')
  await page.fill('input[name=password2]', 'password1234')
  await page.click('button[type=submit]')
  await expect(page.getByText(`Кси, ${name}!`)).toBeVisible()
  return page
}

/** Рисует подпись мышкой на ближайшем поле подписи. */
async function sign(page: Page, index = 0) {
  const pad = page.getByTestId('signature-pad').nth(index)
  await pad.scrollIntoViewIfNeeded()
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(box.x + 20 + i * 18, box.y + box.height / 2 + (i % 2 ? -25 : 25))
  }
  await page.mouse.up()
}

test.beforeAll(async () => {
  await resetDb()
})

test('гражданство по-настоящему: анкета, фото, экзамен, присяга, приём, изготовление, получение, PDF', async ({ browser }) => {
  const admin = await register(browser, 'admin', 'Админ')
  const alice = await register(browser, 'alice', 'Алиса')

  // Админ рисует подпись и публикует расписание приёма
  await admin.goto('/#/cabinet/settings')
  await sign(admin)
  await admin.getByRole('button', { name: 'Сохранить подпись' }).click()
  await expect(admin.getByTestId('current-signature')).toBeVisible()
  await admin.goto('/#/gov')
  await admin.getByRole('button', { name: 'Приём' }).click()
  await admin.fill('input[name=place]', 'Псяленд, ПсяМВД, окно 1234')
  await admin.getByRole('button', { name: 'Опубликовать' }).click()
  await expect(admin.getByTestId('staff-slot')).toHaveCount(4)

  // Алиса: анкета
  await alice.getByRole('link', { name: 'Получить гражданство' }).click()
  await alice.selectOption('select[name=target]', 'BOBO')
  await alice.fill('input[name=last_name]', 'Псянская')
  await alice.fill('input[name=first_name]', 'Алиса')
  await alice.fill('input[name=patronymic]', 'Бобовна')
  await alice.getByLabel('Женский').check()
  await alice.fill('input[name=birth_date]', '2010-05-24')
  await alice.fill('input[name=birth_place]', 'г. Псябург')
  await alice.selectOption('select[name=city]', 'Псябург')
  await alice.fill('textarea[name=reason]', 'Хочу быть сляйнером')
  await alice.getByRole('button', { name: 'Далее' }).click()

  // Фото
  await alice.getByTestId('photo-input').setInputFiles('tests/fixtures/face.svg')
  await alice.getByRole('button', { name: 'Использовать это фото' }).click()
  await expect(alice.getByTestId('photo-preview')).toBeVisible()
  await alice.getByRole('button', { name: 'Далее' }).click()

  // Экзамен: правильные ответы берём из базы
  await alice.getByRole('button', { name: 'Начать экзамен' }).click()
  await expect(alice.getByTestId('exam-question')).toHaveCount(10)
  const [attempt] = await sql<{ question_ids: number[] }>('select question_ids from exam_attempts order by id desc limit 1')
  for (const qid of attempt.question_ids) {
    const [q] = await sql<{ correct: number }>('select correct from exam_questions where id = $1', [qid])
    await alice.locator(`input[name=q${qid}][value="${q.correct}"]`).check()
  }
  await alice.getByRole('button', { name: 'Завершить экзамен' }).click()
  await expect(alice.getByTestId('exam-result')).toContainText('Экзамен сдан')
  await alice.getByRole('button', { name: 'Далее' }).click()

  // Присяга и подпись
  await alice.getByLabel('Клянусь').check()
  await sign(alice)
  await alice.getByRole('button', { name: 'Далее' }).click()

  // Запись на приём
  await alice.getByTestId('slot').first().click()
  await alice.getByRole('button', { name: 'Далее' }).click()
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByTestId('applied')).toBeVisible()
  await alice.getByRole('link', { name: 'Перейти к заявлению' }).click()
  await expect(alice.getByTestId('appointment-info')).toContainText('Псяленд, ПсяМВД, окно 1234')

  // Чиновник: приём, одобрение, изготовление
  await admin.goto('/#/gov')
  await admin.getByRole('button', { name: 'Заявления' }).click()
  await admin.getByTestId('application-row').first().click()
  await expect(admin.getByTestId('application-photo')).toBeVisible()
  await admin.getByRole('button', { name: /Явился/ }).click()
  await admin.getByRole('button', { name: 'Одобрить' }).click()
  await expect(admin.getByText('Изготавливается').first()).toBeVisible()
  await admin.getByRole('button', { name: /Документ изготовлен/ }).click()
  await expect(admin.getByText(/ждёт, когда заявитель распишется/)).toBeVisible()

  // Алиса расписывается в получении
  await alice.reload()
  await expect(alice.getByText('Документ готов к выдаче!')).toBeVisible()
  await sign(alice)
  await alice.getByRole('button', { name: 'Получить документ' }).click()
  await expect(alice.getByText(/Документ выдан/)).toBeVisible()

  // Разворот паспорта с фото и PDF
  await alice.goto('/#/cabinet/documents')
  await expect(alice.getByTestId('passport-spread')).toBeVisible()
  await expect(alice.getByTestId('passport-photo')).toBeVisible()
  await expect(alice.getByTestId('passport-spread')).toContainText('Псянская')
  const [download] = await Promise.all([alice.waitForEvent('download'), alice.getByRole('button', { name: /Скачать PDF/ }).click()])
  const file = await download.path()
  expect(readFileSync(file!).subarray(0, 4).toString()).toBe('%PDF')

  // Решение чиновника тоже скачивается
  await alice.goto('/#/cabinet/applications')
  await alice.getByTestId('application-row').first().click()
  const [decision] = await Promise.all([alice.waitForEvent('download'), alice.getByRole('button', { name: 'Решение (PDF)' }).click()])
  expect(decision.suggestedFilename()).toMatch(/^Reshenie_\d+\.pdf$/)

  // Запрещённое число — автоштраф; админ выдаёт псякоины, Алиса платит
  await alice.goto('/#/services/letter_president')
  await alice.fill('input[name=subject]', 'Вопрос')
  await alice.fill('textarea[name=text]', 'Почему нельзя писать 5 2?')
  await alice.getByRole('button', { name: 'Подать заявление' }).click()
  await expect(alice.getByRole('alert')).toContainText('Запрещённое слово или число')

  await admin.goto('/#/admin')
  const row = admin.locator('div', { has: admin.getByText('@alice') }).filter({ has: admin.getByRole('button', { name: 'Выдать псякоины' }) }).last()
  await row.locator('input[type=number]').fill('1234')
  await row.getByRole('button', { name: 'Выдать псякоины' }).click()
  await expect(row.getByText('1 234 псякоина')).toBeVisible()

  await alice.goto('/#/cabinet/fines')
  await expect(alice.getByTestId('fine-row')).toHaveCount(1)
  await alice.getByRole('button', { name: 'Оплатить' }).click()
  await expect(alice.getByText('Оплачен', { exact: true })).toBeVisible()

  // Проверка документа по номеру доступна всем
  const [doc] = await sql<{ number: string }>(`select number from documents where type = 'passport' limit 1`)
  const guest = await (await browser.newContext()).newPage()
  await guest.goto(`/#/verify/${encodeURIComponent(doc.number)}`)
  await expect(guest.getByTestId('verify-result')).toHaveText('✓ Документ действителен')

  // Псянский режим: лорная дата
  await alice.getByRole('button', { name: 'Пся' }).click()
  await alice.goto('/#/cabinet/wallet')
  await expect(alice.getByText('Смука с псякоинами').first()).toBeVisible()
  await expect(alice.getByText('12.34.1234').first()).toBeVisible()
})

test('гость не попадает в кабинет и госслужбу', async ({ page }) => {
  await page.goto('/#/cabinet')
  await expect(page).toHaveURL(/#\/login/)
  await page.goto('/#/gov')
  await expect(page).toHaveURL(/#\/login/)
})
