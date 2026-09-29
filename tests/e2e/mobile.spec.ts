import { devices, expect, test } from '@playwright/test'
import { createSlot, resetDb, setSignature, signUp } from '../db/helpers'

test.use({ ...devices['iPhone 13'], browserName: 'chromium' })

test('на телефоне мастер и страницы не вылезают за экран', async ({ page }) => {
  await resetDb()
  const admin = await signUp('admin', 'Админ')
  await signUp('alice', 'Алиса')
  await setSignature(admin)
  await createSlot(admin, 'BOBO')
  await page.goto('/#/login')
  await page.fill('input[name=login]', 'alice'); await page.fill('input[name=password]', 'password1234'); await page.click('button[type=submit]')
  await page.waitForURL(/cabinet/)
  await page.goto('/#/services/citizenship'); await page.waitForTimeout(700)
  // Нет горизонтальной прокрутки, шаги показаны компактно
  await expect(page.getByTestId('stepper-compact')).toContainText('Шаг 1 из 6')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.selectOption('select[name=target]', 'BOBO')
  await page.fill('input[name=last_name]', 'Пупов'); await page.fill('input[name=first_name]', 'Жука')
  await page.getByLabel('Мужской').check(); await page.fill('input[name=birth_date]', '2011-03-12')
  await page.fill('input[name=birth_place]', 'г. Псяленд'); await page.selectOption('select[name=city]', 'Псяленд')
  await page.fill('textarea[name=reason]', 'Хочу')
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByTestId('photo-input').setInputFiles('tests/fixtures/face.svg'); await page.waitForTimeout(500)
  for (const url of ['/#/cabinet/documents', '/#/gov', '/#/cabinet/settings', '/#/court', '/#/cabinet/property', '/#/countries']) {
    await page.goto(url); await page.waitForTimeout(500)
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(o, url).toBeLessThanOrEqual(0)
  }
})
