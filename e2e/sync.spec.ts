import { expect, test, type BrowserContext } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

/** Fake Google: OAuth bounces straight back with a token; Drive keeps one file in memory shared by both phones. */
async function fakeGoogle(context: BrowserContext, drive: { file: string | null; uploads: number }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await context.route('https://accounts.google.com/**', route => {
    const q = new URL(route.request().url()).searchParams
    expect(q.get('scope')).toBe('https://www.googleapis.com/auth/drive.file')
    route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#access_token=tok&expires_in=3600&state=${q.get('state')}` } })
  })
  await context.route('https://www.googleapis.com/**', route => {
    const req = route.request(), url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    expect(req.headers().authorization).toBe('Bearer tok')
    const json = (body: unknown) => route.fulfill({ headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'GET' && url.pathname === '/drive/v3/files') return json({ files: drive.file ? [{ id: 'f1' }] : [] })
    if (req.method() === 'GET' && url.pathname === '/drive/v3/files/f1') return route.fulfill({ headers: cors, body: drive.file! })
    if (req.method() === 'POST' && url.pathname === '/drive/v3/files') return json({ id: 'f1' })
    if (req.method() === 'PATCH' && url.pathname === '/upload/drive/v3/files/f1') { drive.file = req.postData(); drive.uploads++; return json({ id: 'f1' }) }
    return route.fulfill({ status: 500, headers: cors })
  })
}

test('two phones share data through Drive', async ({ browser }) => {
  const drive = { file: null as string | null, uploads: 0 }
  const errors: string[] = []
  const phone = async () => {
    const ctx = await browser.newContext()
    await fakeGoogle(ctx, drive)
    const page = await ctx.newPage()
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    await page.goto('/')
    return page
  }

  // My phone: create child, sign in, log a diaper → uploaded
  const mine = await phone()
  await mine.getByLabel('Name').fill('Luca')
  await mine.getByLabel('Birth date').fill('2026-06-01')
  await mine.getByRole('button', { name: 'Save' }).click()
  await mine.getByRole('button', { name: /sign in to Google/ }).click()
  await expect(mine.getByRole('button', { name: 'Sync now' })).toContainText('Synced')
  await mine.getByRole('button', { name: 'Diaper' }).click()
  await mine.getByRole('button', { name: 'Wet' }).click()
  await expect.poll(() => drive.file ?? '', { timeout: 10_000 }).toContain('"kind":"wet"')

  // Her phone: fresh install, sign in from the welcome screen, gets child + diaper
  const hers = await phone()
  await hers.getByRole('button', { name: 'Sign in to Google' }).click()
  await expect(hers.getByRole('heading', { name: 'Luca' })).toBeVisible()
  await expect(hers.locator('.card .list')).toContainText('wet')

  // She logs a poop; I pull it on next sync
  await hers.getByRole('button', { name: 'Diaper' }).click()
  await hers.getByRole('button', { name: 'Poop' }).click()
  await expect.poll(() => drive.file ?? '', { timeout: 10_000 }).toContain('"kind":"dirty"')
  await mine.getByRole('button', { name: 'Sync now' }).click()
  await expect(mine.locator('.card .list')).toContainText('dirty')

  expect(errors).toEqual([])
})
