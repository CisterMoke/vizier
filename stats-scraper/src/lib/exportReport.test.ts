import { downloadExportReport, serializeExportReport } from './exportReport'
import type { ExportPayload } from '../store/workspaceStore'

const payload: ExportPayload = {
  schemaRaw: 'orders(id int)',
  datasetSchema: {
    source: 'SQL: orders table',
    fields: [{ name: 'id', type: 'number', nullable: false }],
    warnings: []
  },
  insights: [
    {
      id: 'ins-1',
      title: 'Orders over time',
      summary: 'Order counts by day.',
      confidence: 0.81,
      hypothesis: 'Daily order counts are increasing.',
      metricDescription: 'Daily order count.',
      chartSpec: {
        mode: 'recipe',
        chartType: 'line',
        xAxis: { column: 'day', aggregation: 'none' },
        yAxis: { column: 'count', aggregation: 'count' }
      },
      dataProfile: {
        rowCount: 30,
        columns: [
          { name: 'day', generator: 'linear', start: 1, end: 30, step: 1 },
          { name: 'count', generator: 'normal', mean: 100, stddev: 20, min: 50, max: 200 }
        ]
      },
      assumptions: ['Order dates are present.']
    }
  ],
  datasetsByInsightId: {},
  seed: 1337,
  generatedAt: '2026-08-18T00:00:00.000Z'
}

it('serializes export payload to formatted JSON', () => {
  const json = serializeExportReport(payload)
  expect(json).toContain('"schemaRaw": "orders(id int)"')
  expect(json).toContain('"source": "SQL: orders table"')
})

it('downloads a portable JSON artifact', () => {
  const clickSpy = vi.fn()
  const originalCreateElement = document.createElement.bind(document)
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  URL.createObjectURL = vi.fn(() => 'blob:report')
  URL.revokeObjectURL = vi.fn()

  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName.toLowerCase() === 'a') {
      return {
        href: '',
        download: '',
        click: clickSpy
      } as unknown as HTMLAnchorElement
    }

    return originalCreateElement(tagName)
  })

  downloadExportReport(payload, 'studio-export.json')

  expect(URL.createObjectURL).toHaveBeenCalled()
  expect(clickSpy).toHaveBeenCalledTimes(1)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report')

  createElementSpy.mockRestore()
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
})
