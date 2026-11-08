import { expect, test } from '@playwright/test'

const INSIGHT = {
  id: 'i1',
  metadata: { title: 'Orders trend', summary: 'Orders over time', description: null },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: [{ type: 'bar', x: ['A', 'B'], y: [1, 2] }],
    plotlyLayout: { title: { text: 'Orders trend' } },
  },
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { maxFileSize: null, maxRows: null } })
  )
  await page.route('**/api/session/*/insight/*/svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
    })
  )
  const events = [
    { type: 'prepare', rowCount: 0 },
    { type: 'schema', fieldCount: 2, warnings: [] },
    { type: 'insights', count: 1 },
    { type: 'chart', index: 0, total: 1, insightId: 'i1', title: 'Orders trend' },
    {
      type: 'complete',
      payload: {
        sessionId: 'e2e-session',
        insights: [INSIGHT],
        dataset_schema: null,
        data_profile: null,
      },
    },
  ]
  const body = events.map((event) => JSON.stringify(event)).join('\n')
  await page.route('**/api/generate', (route) =>
    route.fulfill({ contentType: 'text/plain', body })
  )
})

test('generate renders the mosaic and dragging a card moves it', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/data description/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /generate insights/i }).click()

  const item = page.locator('.react-grid-item').first()
  // the grid is a lazy chunk: under load (e.g. right after a full build)
  // its first import can take longer than the default 5s
  await expect(item).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /orders trend/i })).toBeVisible()

  const before = await item.getAttribute('style')
  const handle = page.locator('.grid-drag-handle').first()
  const box = await handle.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + 240, box!.y + 160, { steps: 5 })
  await page.mouse.up()

  const after = await item.getAttribute('style')
  expect(after).not.toBe(before)
})

test('the visible resize handle resizes a cell', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(/data description/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /generate insights/i }).click()

  const item = page.locator('.react-grid-item').first()
  // the grid is a lazy chunk: under load (e.g. right after a full build)
  // its first import can take longer than the default 5s
  await expect(item).toBeVisible({ timeout: 20_000 })

  const handle = page.locator('.grid-resize-handle').first()
  await expect(handle).toBeVisible()
  const before = await item.getAttribute('style')
  const box = await handle.boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x - 120, box!.y - 60, { steps: 5 })
  await page.mouse.up()

  const after = await item.getAttribute('style')
  expect(after).not.toBe(before)
})

async function openFirstCard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByLabel(/data description/i).fill('orders(id int, total decimal)')
  await page.getByRole('button', { name: /generate insights/i }).click()

  const item = page.locator('.react-grid-item').first()
  await expect(item).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /orders trend/i })).toBeVisible()
  return page.getByRole('button', { name: 'Edit chart' }).locator('..')
}

test('card action buttons stay hidden until hover on pointer-fine devices', async ({ page }) => {
  const actions = await openFirstCard(page)
  await expect(actions).toHaveCSS('opacity', '0')

  await page.getByTestId('chart-card').first().hover()
  await expect(actions).toHaveCSS('opacity', '1')
})

test.describe('touch device', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } })

  test('card action buttons are visible without hover on touch devices', async ({ page }) => {
    const actions = await openFirstCard(page)
    await expect(actions).toHaveCSS('opacity', '1')
  })
})
