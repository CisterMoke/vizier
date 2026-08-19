import { generateMockDataset } from './mockData'
import type { DatasetSchema, InsightCandidate } from '../domain/types'

const mockSchema: DatasetSchema = {
  source: 'SQL: orders table',
  fields: [
    { name: 'id', jsonPath: '$.id', type: 'number', nullable: false, semanticType: 'identifier', unique: true },
    { name: 'customer_name', jsonPath: '$.customer_name', type: 'string', nullable: false, semanticType: 'dimension' },
    { name: 'is_repeat', jsonPath: '$.is_repeat', type: 'boolean', nullable: false }
  ],
  warnings: []
}

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Repeat customer rate trend',
  summary: 'Track repeat rate by week.',
  confidence: 0.9,
  hypothesis: 'Repeat rate changes week to week.',
  metricDescription: 'Share of repeat customers by week.',
  chartSpec: {
    mode: 'recipe',
    traces: [
      { chartType: 'line', xAxis: '$.week', yAxis: '$.repeat_rate' }
    ]
  },
  dataProfile: {
    columns: [
      { name: '$.week', generator: 'linear', start: 1, end: 52, step: 1 },
      { name: '$.repeat_rate', generator: 'normal', mean: 0.4, stddev: 0.1, min: 0, max: 1 }
    ]
  },
  assumptions: ['Customer IDs are stable across orders.']
}

it('generates deterministic rows for same seed', () => {
  const a = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  const b = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(a.rows).toEqual(b.rows)
})

it('generates rows matching the data profile column count', () => {
  const dataset = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(dataset.columns).toHaveLength(2)
  expect(dataset.columns).toContain('$.week')
  expect(dataset.columns).toContain('$.repeat_rate')
})

it('generates linear values for linear generator', () => {
  const dataset = generateMockDataset(mockSchema, mockInsight, { seed: 42 })
  expect(dataset.rows[0].week).toBe(1)
  expect(dataset.rows[1].week).toBe(2)
  expect(dataset.rows[51].week).toBe(52)
})

it('generates category values from the categories array', () => {
  const categoryInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      columns: [
        { name: '$.segment', generator: 'category', categories: ['A', 'B', 'C'] },
        { name: '$.value', generator: 'uniform', min: 10, max: 100 }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, categoryInsight, { seed: 7 })
  for (const row of dataset.rows) {
    expect(['A', 'B', 'C']).toContain(row.segment)
  }
})

it('generates constant values', () => {
  const constantInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      columns: [
        { name: '$.label', generator: 'constant', value: 'fixed' }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, constantInsight, { seed: 1 })
  for (const row of dataset.rows) {
    expect(row.label).toBe('fixed')
  }
})

it('handles plain column names (non-JSONPath) as fallback', () => {
  const plainInsight: InsightCandidate = {
    ...mockInsight,
    dataProfile: {
      columns: [
        { name: 'category', generator: 'category', categories: ['X', 'Y'] }
      ]
    }
  }
  const dataset = generateMockDataset(mockSchema, plainInsight, { seed: 1 })
  expect(dataset.rows[0].category).toBeDefined()
})
