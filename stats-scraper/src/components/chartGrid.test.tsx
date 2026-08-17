import { fireEvent, render, screen } from '@testing-library/preact'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import { ChartGrid } from './ChartGrid'

vi.mock('react-plotly.js', () => ({
  default: (props: { data: Array<{ type?: string }> }) => (
    <div data-testid="plotly-chart" data-trace-type={props.data[0]?.type ?? 'unknown'} />
  )
}))

const insights: InsightCandidate[] = [
  {
    id: 'ins-1',
    title: 'Revenue by category',
    summary: 'Show revenue by category as a bar chart.',
    confidence: 0.88,
    hypothesis: 'Categories have uneven revenue distribution.',
    metricDescription: 'Sum of revenue by category.',
    chartRecommendation: 'bar',
    assumptions: ['Revenue values are numeric and complete.']
  }
]

const datasets: Record<string, GeneratedDataset> = {
  'ins-1': {
    id: 'dataset-1',
    name: 'Revenue sample',
    columns: ['category', 'revenue'],
    rows: [
      { category: 'A', revenue: 120 },
      { category: 'B', revenue: 95 }
    ]
  }
}

it('renders chart cards and exposes card actions', () => {
  const onRegenerate = vi.fn()
  const onDelete = vi.fn()

  render(
    <ChartGrid insights={insights} datasetsByInsightId={datasets} onRegenerate={onRegenerate} onDelete={onDelete} />
  )

  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()
  expect(screen.getByTestId('plotly-chart')).toHaveAttribute('data-trace-type', 'bar')
  fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete/i }))

  expect(onRegenerate).toHaveBeenCalledWith('ins-1')
  expect(onDelete).toHaveBeenCalledWith('ins-1')
})
