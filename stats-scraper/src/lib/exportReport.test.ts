import { downloadExportReport, serializeExportReport } from './exportReport'
import type { ExportPayload } from '../store/workspaceStore'

const payload: ExportPayload = {
  schemaRaw: 'orders(id int)',
  canonicalSchema: {
    entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
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
      chartRecommendation: 'line',
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
