import { expect, test } from '@playwright/test'

test('end-to-end flow from schema paste to report export', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/schema text/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /normalize/i }).click()
  await page.getByRole('button', { name: /generate/i }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(3)
  await page.getByRole('button', { name: /export/i }).click()
  await expect(page.getByText(/fallback-1/i)).toBeVisible()
})
