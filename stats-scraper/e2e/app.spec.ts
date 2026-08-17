import { expect, test } from '@playwright/test'

test('end-to-end flow from schema paste to report export', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/schema text/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /normalize/i }).click()
  await page.getByRole('button', { name: /generate/i }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(3)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /export/i }).click()
  const download = await downloadPromise

  await expect(download.suggestedFilename()).toMatch(/analytics-report-\d{4}-\d{2}-\d{2}\.json/i)
  await expect(await download.failure()).toBeNull()
})
