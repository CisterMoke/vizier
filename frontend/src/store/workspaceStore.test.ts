import { renderHook, act } from '@testing-library/preact'
import type { DatasetSchema, GeneratedDataset, InsightCandidate } from '../domain/types'
import { buildExportPayload, useWorkspaceStore } from './workspaceStore'

const mockSchema: DatasetSchema = {
  source: 'SQL: orders table',
  fields: [
    { name: 'id', type: 'number', nullable: false, semanticType: 'identifier' },
    { name: 'total', type: 'number', nullable: false, semanticType: 'currency' }
  ],
  warnings: []
}

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Revenue trend',
  summary: 'Track total revenue over time',
  confidence: 0.9,
  hypothesis: 'Revenue increases over time.',
  metricDescription: 'Weekly total revenue.',
  chartSpec: {
    mode: 'recipe',
    chartType: 'line',
    xAxis: 'week',
    yAxis: 'revenue'
  },
  dataProfile: {
    rowCount: 52,
    columns: [
      { name: 'week', generator: 'linear', start: 1, end: 52, step: 1 },
      { name: 'revenue', generator: 'normal', mean: 500, stddev: 200, min: 0, max: 2000 }
    ]
  },
  assumptions: ['Order totals are complete.']
}

const mockDataset: GeneratedDataset = {
  id: 'dataset-ins-1-1337',
  name: 'Revenue trend sample',
  columns: ['week', 'revenue'],
  rows: [{ week: 1, revenue: 120.5 }]
}

it('builds export payload with schema, insights, datasets, and timestamp', () => {
  const payload = buildExportPayload({
    rawSchema: 'orders(id int, total decimal)',
    datasetSchema: mockSchema,
    insights: [mockInsight],
    datasetsByInsightId: { [mockInsight.id]: mockDataset },
    demoSeed: 1337
  })

  expect(payload.insights.length).toBeGreaterThan(0)
  expect(payload.generatedAt).toBeDefined()
  expect(payload.seed).toBe(1337)
  expect(payload.datasetsByInsightId[mockInsight.id]?.id).toBe(mockDataset.id)
})

it('stores insights and removes related datasets together', () => {
  const { result } = renderHook(() => useWorkspaceStore())

  act(() => {
    result.current.setInsights([mockInsight])
    result.current.attachDataset(mockInsight.id, mockDataset)
  })

  expect(result.current.insights).toHaveLength(1)
  expect(result.current.datasetsByInsightId[mockInsight.id]?.id).toBe(mockDataset.id)

  act(() => {
    result.current.removeInsight(mockInsight.id)
  })

  expect(result.current.insights).toHaveLength(0)
  expect(result.current.datasetsByInsightId[mockInsight.id]).toBeUndefined()
})
