import { generateInsightCandidates } from './insightGeneration'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

const mockSchema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

it('returns validated insight candidates from provider output', async () => {
  const provider = {
    generateInsights: async (): Promise<InsightCandidate[]> => [
      { id: 'i1', title: 'AOV by segment', summary: 'Compare average order value by customer segment.', confidence: 0.84 }
    ]
  }

  const items = await generateInsightCandidates(mockSchema, provider)

  expect(items[0].title).toMatch(/AOV/i)
})
