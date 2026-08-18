import { generateInsightCandidates } from './insightGeneration'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

const mockSchema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

it('returns validated insight candidates from provider output', async () => {
  const provider = {
    mapCanonicalSchema: async (): Promise<CanonicalSchema> => mockSchema,
    generateInsights: async (): Promise<InsightCandidate[]> => [
      {
        id: 'i1',
        title: 'AOV by segment',
        summary: 'Compare average order value by customer segment.',
        confidence: 0.84,
        hypothesis: 'Average order value differs by customer segment.',
        metricDescription: 'Average total amount per order grouped by customer segment.',
        chartRecommendation: 'bar',
        assumptions: ['Order totals are present for all records.']
      }
    ]
  }

  const items = await generateInsightCandidates(mockSchema, provider)

  expect(items[0].title).toMatch(/AOV/i)
  expect(items[0].hypothesis).toMatch(/segment/i)
  expect(items[0].assumptions).toHaveLength(1)
})
