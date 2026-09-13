import { useWorkspaceStore } from './workspaceStore'
import type { InsightCandidate } from '../domain/types'

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Revenue trend',
  summary: 'Weekly revenue over time.',
  keyIdea: 'Revenue increases over time.',
  metricDescription: 'Weekly total revenue.',
  assumptions: ['Revenue values are positive.'],
  plotlyData: [],
  plotlyLayout: {}
}

it('workspaceStore exports useWorkspaceStore hook', () => {
  expect(typeof useWorkspaceStore).toBe('function')
})

it('mockInsight has correct shape for new schema', () => {
  expect(mockInsight.id).toBe('ins-1')
  expect(mockInsight.plotlyData).toEqual([])
  expect(mockInsight.plotlyLayout).toEqual({})
  expect(mockInsight.assumptions).toHaveLength(1)
})
