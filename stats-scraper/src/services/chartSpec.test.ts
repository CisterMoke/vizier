import { buildPlotlySpec } from './chartSpec'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'

const mockBarInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Revenue by category',
  summary: 'Show revenue by category as a bar chart.',
  confidence: 0.91
}

const mockDataset: GeneratedDataset = {
  id: 'dataset-1',
  name: 'Revenue sample',
  columns: ['category', 'revenue'],
  rows: [
    { category: 'A', revenue: 120 },
    { category: 'B', revenue: 95 }
  ]
}

it('maps bar chart intent to a bar trace', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('bar')
})
