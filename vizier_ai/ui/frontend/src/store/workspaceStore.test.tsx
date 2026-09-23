import { fireEvent, render, screen } from '@testing-library/react'
import { useWorkspaceStore } from './workspaceStore'
import type { InsightCandidate } from '../domain/types'

const mockInsight: InsightCandidate = {
  id: 'ins-1',
  metadata: {
    title: 'Revenue trend',
    summary: 'Weekly revenue over time.',
    keyIdea: 'Revenue increases over time.',
    description: null,
  },
  chartSpec: {
    traces: [],
    plotlyData: [],
    plotlyLayout: {}
  }
}

it('workspaceStore exports useWorkspaceStore hook', () => {
  expect(typeof useWorkspaceStore).toBe('function')
})

it('mockInsight has correct shape', () => {
  expect(mockInsight.id).toBe('ins-1')
  expect(mockInsight.metadata.title).toBe('Revenue trend')
  expect(mockInsight.chartSpec.plotlyData).toEqual([])
  expect(mockInsight.chartSpec.plotlyLayout).toEqual({})
})

describe('bundleContext', () => {
  it('starts null and can be set', () => {
    const Probe = () => {
      const store = useWorkspaceStore()
      return (
        <button
          onClick={() => store.setBundleContext({ schema: { source: 's', fields: [] }, dataProfile: null })}
        >
          {store.bundleContext ? 'set' : 'unset'}
        </button>
      )
    }

    render(<Probe />)

    expect(screen.getByText('unset')).toBeInTheDocument()

    fireEvent.click(screen.getByText('unset'))

    expect(screen.getByText('set')).toBeInTheDocument()
  })
})
