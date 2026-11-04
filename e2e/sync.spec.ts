import { expect, test, type BrowserContext } from '@playwright/test'
import { generateKeyPairSync, verify as cryptoVerify } from 'node:crypto'

test.use({ serviceWorkers: 'block' })

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KEY = JSON.stringify({ type: 'service_account', client_email: 'luca@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
const keyFile = { name: 'key.json', mimeType: 'application/json', buffer: Buffer.from(KEY) }

/** Fake Google: the token endpoint checks the JWT signature; Drive holds one pre-shared file used by both phones. */
async function fakeGoogle(context: BrowserContext, drive: { file: string; uploads: number }) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  await context.route('https://oauth2.googleapis.com/token', route => {
    const jwt = new URLSearchParams(route.request().postData()!).get('assertion')!.split('.')
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url').toString())
    expect(claims.iss).toBe('luca@proj.iam.gserviceaccount.com')
    expect(cryptoVerify('RSA-SHA256', Buffer.from(jwt[0] + '.' + jwt[1]), publicKey, Buffer.from(jwt[2], 'base64url'))).toBe(true)
    route.fulfill({ headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: 'tok', expires_in: 3600 }) })
  })
  await context.route('https://www.googleapis.com/**', route => {
    const req = route.request(), url = new URL(req.url())
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    expect(req.headers().authorization).toBe('Bearer tok')
    const json = (body: unknown) => route.fulfill({ headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (req.method() === 'GET' && url.pathname === '/drive/v3/files') return json({ files: [{ id: 'f1' }] })
    if (req.method() === 'GET' && url.pathname === '/drive/v3/files/f1') return route.fulfill({ headers: cors, body: drive.file })
    if (req.method() === 'PATCH' && url.pathname === '/upload/drive/v3/files/f1') { drive.file = req.postData()!; drive.uploads++; return json({ id: 'f1' }) }
    return route.fulfill({ status: 500, headers: cors })
  })
}

test('two phones share data through Drive', async ({ browser }) => {
  const drive = { file: '', uploads: 0 } // the empty luca-data.json the README tells you to share
  const errors: string[] = []
  const phone = async () => {
    const ctx = await browser.newContext()
    await fakeGoogle(ctx, drive)
    const page = await ctx.newPage()
    page.on('console', m => m.type() === 'error' && errors.push(m.text()))
    await page.goto('/')
    return page
  }

  // My phone: create child, add the key in Settings, log a diaper → uploaded
  const mine = await phone()
  await mine.getByLabel('Name').fill('Luca')
  await mine.getByLabel('Birth date').fill('2026-06-01')
  await mine.getByRole('button', { name: 'Save' }).click()
  await mine.getByRole('link', { name: /More/ }).click()
  await mine.getByLabel('Sync key (JSON file)').setInputFiles(keyFile)
  await expect(mine.getByLabel('Sync now')).toContainText('Synced')
  await mine.getByRole('link', { name: /Home/ }).click()
  await mine.getByRole('button', { name: 'Diaper' }).click()
  await mine.getByRole('button', { name: 'Wet' }).click()
  await expect.poll(() => drive.file, { timeout: 10_000 }).toContain('"kind":"wet"')

  // Her phone: fresh install, adds the key on the welcome screen, gets child + diaper
  const hers = await phone()
  await hers.getByLabel('Sync key (JSON file)').setInputFiles(keyFile)
  await expect(hers.getByRole('heading', { name: 'Luca' })).toBeVisible()
  await expect(hers.locator('.card .list')).toContainText('wet')

  // She logs a poop; I pull it on next sync
  await hers.getByRole('button', { name: 'Diaper' }).click()
  await hers.getByRole('button', { name: 'Poop' }).click()
  await expect.poll(() => drive.file, { timeout: 10_000 }).toContain('"kind":"dirty"')
  await mine.getByRole('button', { name: 'Sync now' }).click()
  await expect(mine.locator('.card .list')).toContainText('dirty')

  expect(errors).toEqual([])
})
