import { generateMockDataset } from './mockData'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

const mockSchema: CanonicalSchema = {
  entities: [
    {
      name: 'orders',
      fields: [
        { name: 'id', type: 'number', nullable: false },
        { name: 'customer_name', type: 'string', nullable: false },
        { name: 'is_repeat', type: 'boolean', nullable: false }
      ]
    }
  ],
  relationships: [],
  warnings: []
}

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Repeat customer rate trend',
  summary: 'Track repeat rate by week.',
  confidence: 0.9
}

it('generates deterministic rows for same seed', () => {
  const a = generateMockDataset(mockSchema, mockInsight, { seed: 42, rowCount: 50 })
  const b = generateMockDataset(mockSchema, mockInsight, { seed: 42, rowCount: 50 })

  expect(a.rows).toEqual(b.rows)
})
