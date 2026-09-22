import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import { ChartCarousel } from './ChartCarousel'

vi.mock('react-plotly.js', () => ({
  default: (props: { data: Array<{ type?: string }> }) => (
    <div data-testid="plotly-chart" data-trace-type={props.data[0]?.type ?? 'unknown'} />
  )
}))

vi.mock('../services/apiClient', () => ({
  editChart: vi.fn().mockResolvedValue({ plotlyData: [], plotlyLayout: {} }),
}))

const insights: InsightCandidate[] = [
  {
    id: 'ins-1',
    metadata: {
      title: 'Revenue by category',
      summary: 'Show revenue by category as a bar chart.',
      keyIdea: 'Revenue varies by category.',
      description: null,
    },
    chart_spec: {
      traces: [],
      plotlyData: [{ type: 'bar', x: ['A', 'B'], y: [120, 95] }],
      plotlyLayout: { title: { text: 'Revenue' } }
    }
  },
  {
    id: 'ins-2',
    metadata: {
      title: 'Order volume trend',
      summary: 'Weekly order count over time.',
      keyIdea: 'Order volume shows seasonal patterns.',
      description: null,
    },
    chart_spec: {
      traces: [],
      plotlyData: [{ type: 'scatter', mode: 'lines+markers', x: [1, 2], y: [150, 220] }],
      plotlyLayout: { title: { text: 'Volume' } }
    }
  }
]

const renderCarousel = (props: any) =>
  render(
    <div id="portal-root">
      <MantineProvider>
        <ChartCarousel {...props} />
      </MantineProvider>
    </div>
  )

it('renders a single chart card with navigation dots for multiple insights', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()
  expect(screen.getByTestId('chart-card')).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
})

it('navigates to next chart when clicking the next button', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /\u2192/ }))
  expect(screen.getByRole('heading', { name: /order volume trend/i })).toBeInTheDocument()
})

it('exposes delete action', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  fireEvent.click(screen.getByRole('button', { name: /delete/i }))

  expect(onDelete).toHaveBeenCalledWith('ins-1')
})
