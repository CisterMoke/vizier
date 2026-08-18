import { expect, test } from '@playwright/test'

test('end-to-end flow from schema paste to report export', async ({ page }) => {
  let requestCount = 0

  const mockGoogleResponse = (payload: unknown) => ({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(payload) }],
          role: 'model'
        },
        finishReason: 'STOP'
      }
    ]
  })

  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    requestCount += 1

    if (requestCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          mockGoogleResponse({
            source: 'SQL: orders table',
            fields: [
              { name: 'id', type: 'number', nullable: false, semanticType: 'identifier' },
              { name: 'total', type: 'number', nullable: false, semanticType: 'currency' }
            ],
            warnings: []
          })
        )
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockGoogleResponse({
          insights: [
            {
              id: 'insight-1',
              title: 'Orders over time',
              summary: 'Weekly order count trend.',
              confidence: 0.84,
              hypothesis: 'Orders are increasing week by week.',
              metricDescription: 'Weekly order count.',
              chartSpec: {
                mode: 'recipe',
                chartType: 'line',
                xAxis: { column: 'week', aggregation: 'none' },
                yAxis: { column: 'order_count', aggregation: 'none' }
              },
              dataProfile: {
                rowCount: 12,
                columns: [
                  { name: 'week', generator: 'linear', start: 1, end: 12, step: 1 },
                  { name: 'order_count', generator: 'normal', mean: 200, stddev: 50, min: 50, max: 400 }
                ]
              },
              assumptions: ['created_at timestamps are complete']
            }
          ]
        })
      )
    })
  })

  await page.goto('/')
  await page.getByLabel(/schema text/i).fill('orders(id int, total decimal)')
  await page.getByLabel(/api key/i).fill('demo-key')
  await page.getByRole('button', { name: /map schema with ai/i }).click()
  await page.getByRole('button', { name: /generate/i }).click()
  await expect(page.getByTestId('chart-card')).toHaveCount(1)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /export/i }).click()
  const download = await downloadPromise

  await expect(download.suggestedFilename()).toMatch(/analytics-report-\d{4}-\d{2}-\d{2}\.json/i)
  await expect(await download.failure()).toBeNull()
})
