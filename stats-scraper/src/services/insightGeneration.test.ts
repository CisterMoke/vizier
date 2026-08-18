import { generateInsightCandidates } from './insightGeneration'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

const mockSchema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

const mockInsight: InsightCandidate = {
  id: 'i1',
  title: 'AOV by segment',
  summary: 'Compare average order value by customer segment.',
  confidence: 0.84,
  hypothesis: 'Average order value differs by customer segment.',
  metricDescription: 'Average total amount per order grouped by customer segment.',
  chartSpec: {
    mode: 'recipe',
    chartType: 'bar',
    xAxis: { column: 'segment', aggregation: 'none' },
    yAxis: { column: 'aov', aggregation: 'avg' }
  },
  dataProfile: {
    rowCount: 50,
    columns: [
      { name: 'segment', generator: 'category', categories: ['Enterprise', 'SMB', 'Startup'] },
      { name: 'aov', generator: 'normal', mean: 200, stddev: 50, min: 50, max: 500 }
    ]
  },
  assumptions: ['Order totals are present for all records.']
}

it('returns validated insight candidates from provider output', async () => {
  const provider = {
    mapCanonicalSchema: async (): Promise<CanonicalSchema> => mockSchema,
    generateInsights: async (): Promise<InsightCandidate[]> => [mockInsight]
  }

  const items = await generateInsightCandidates(mockSchema, provider)

  expect(items[0].title).toMatch(/AOV/i)
  expect(items[0].hypothesis).toMatch(/segment/i)
  expect(items[0].assumptions).toHaveLength(1)
  expect(items[0].chartSpec.mode).toBe('recipe')
  expect(items[0].dataProfile.columns).toHaveLength(2)
})
