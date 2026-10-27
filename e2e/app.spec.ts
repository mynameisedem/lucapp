import { expect, test, type Page } from '@playwright/test'

async function setup(page: Page) {
  const errors: string[] = []
  page.on('console', m => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/')
  await page.getByLabel('Name').fill('Luca')
  await page.getByLabel('Birth date').fill('2026-06-01')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'Luca' })).toBeVisible()
  return errors
}

test('log diaper with undo, sleep timer survives reload', async ({ page }) => {
  const errors = await setup(page)

  await page.getByRole('button', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Wet' }).click()
  await expect(page.getByRole('status')).toContainText('Diaper (wet) logged')
  await page.getByRole('button', { name: 'Undo' }).click()

  await page.getByRole('button', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Both' }).click()
  await page.getByRole('button', { name: 'Sleep', exact: true }).click()
  await page.getByRole('button', { name: 'Start sleep' }).click()
  await expect(page.getByRole('button', { name: 'Start sleep' })).toBeHidden()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible()
  await page.getByRole('button', { name: 'Stop' }).click()

  await page.getByRole('link', { name: 'Timeline' }).click()
  const items = page.locator('.list li')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText('Sleep')
  await expect(items.last()).toContainText('both')

  // edit then delete with undo
  await items.last().click()
  await page.getByRole('radio', { name: 'Poop' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(items.last()).toContainText('dirty')
  await items.last().click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(items).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(items).toHaveCount(2)

  expect(errors).toEqual([])
})

test('breastfeeding offers the other side next', async ({ page }) => {
  await setup(page)
  await page.getByRole('button', { name: 'Feed' }).click()
  await expect(page.getByRole('button', { name: 'Stop' })).toBeHidden() // not started automatically
  await page.getByRole('button', { name: /Start Right/ }).click()
  await expect(page.getByRole('button', { name: /^Right/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /^Left/ }).click()
  await expect(page.getByRole('button', { name: /^Left/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('button', { name: 'Feed' }).click()
  await expect(page.locator('.sides button').first()).toHaveText(/Start Right.*next side/) // last was Left
  await page.getByRole('link', { name: 'Timeline' }).click()
  await expect(page.locator('.list li')).toContainText('Breastfeed')
})

test('works offline after first load', async ({ page, context }) => {
  await setup(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // let the SW control the page
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Luca' })).toBeVisible()
  await page.getByRole('button', { name: 'Diaper' }).click()
  await page.getByRole('button', { name: 'Poop' }).click()
  await page.getByRole('link', { name: 'Stats' }).click()
  await expect(page.locator('.kv')).toContainText('0 wet · 1 dirty')
})

test('shortcut starts sleep', async ({ page }) => {
  await setup(page)
  await page.goto('/#/quick/sleep')
  await expect(page.locator('.timer')).toContainText('Sleep')
})
