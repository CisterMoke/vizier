import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import { ChartCarousel } from './ChartCarousel'

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
    chartSpec: {
      mode: 'recipe',
      chartType: 'bar',
      xAxis: 'category',
      yAxis: 'revenue'
    },
    dataProfile: {
      rowCount: 4,
      columns: [
        { name: 'category', generator: 'category', categories: ['A', 'B', 'C', 'D'] },
        { name: 'revenue', generator: 'uniform', min: 100, max: 500 }
      ]
    },
    assumptions: ['Revenue values are numeric and complete.']
  },
  {
    id: 'ins-2',
    title: 'Order volume trend',
    summary: 'Weekly order count over time.',
    confidence: 0.82,
    hypothesis: 'Order volume shows seasonal patterns.',
    metricDescription: 'Weekly order count.',
    chartSpec: {
      mode: 'recipe',
      chartType: 'line',
      xAxis: 'week',
      yAxis: 'count'
    },
    dataProfile: {
      rowCount: 12,
      columns: [
        { name: 'week', generator: 'linear', start: 1, end: 12, step: 1 },
        { name: 'count', generator: 'normal', mean: 200, stddev: 50, min: 50, max: 400 }
      ]
    },
    assumptions: ['Weeks are sequential.']
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
  },
  'ins-2': {
    id: 'dataset-2',
    name: 'Volume sample',
    columns: ['week', 'count'],
    rows: [
      { week: 1, count: 150 },
      { week: 2, count: 220 }
    ]
  }
}

it('renders a single chart card with navigation dots for multiple insights', () => {
  const onRegenerate = vi.fn()
  const onDelete = vi.fn()

  render(
    <MantineProvider>
      <ChartCarousel
        insights={insights}
        datasetsByInsightId={datasets}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />
    </MantineProvider>
  )

  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()
  expect(screen.getByTestId('chart-card')).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
})

it('navigates to next chart when clicking the next button', () => {
  const onRegenerate = vi.fn()
  const onDelete = vi.fn()

  render(
    <MantineProvider>
      <ChartCarousel
        insights={insights}
        datasetsByInsightId={datasets}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />
    </MantineProvider>
  )

  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /\u2192/ }))
  expect(screen.getByRole('heading', { name: /order volume trend/i })).toBeInTheDocument()
})

it('exposes card actions', () => {
  const onRegenerate = vi.fn()
  const onDelete = vi.fn()

  render(
    <MantineProvider>
      <ChartCarousel
        insights={insights}
        datasetsByInsightId={datasets}
        onRegenerate={onRegenerate}
        onDelete={onDelete}
      />
    </MantineProvider>
  )

  fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete/i }))

  expect(onRegenerate).toHaveBeenCalledWith('ins-1')
  expect(onDelete).toHaveBeenCalledWith('ins-1')
})
