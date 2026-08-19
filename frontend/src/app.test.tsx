import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

const callGenerateMock = vi.fn()

vi.mock('./services/apiClient', () => ({
  callGenerate: (...args: unknown[]) => callGenerateMock(...args)
}))

import { App } from './app'

beforeEach(() => {
  callGenerateMock.mockReset()
})

const renderApp = () => render(<MantineProvider><App /></MantineProvider>)

it('renders analytics idea lab shell', () => {
  renderApp()

  expect(screen.getByRole('heading', { name: /analytics idea lab/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate analytics/i })).toBeInTheDocument()
})

it('calls backend API on generate and renders chart cards', async () => {
  callGenerateMock.mockResolvedValue({
    schema: {
      source: 'SQL: orders table',
      fields: [
        { name: 'id', type: 'number', nullable: false, semanticType: 'identifier' },
        { name: 'total', type: 'number', nullable: false, semanticType: 'currency' }
      ],
      warnings: []
    },
    insights: [
      {
        id: 'insight-1',
        title: 'Orders trend',
        summary: 'Orders over time',
        confidence: 0.82,
        hypothesis: 'Orders climb weekly',
        metricDescription: 'Weekly order count',
      chartSpec: {
        mode: 'recipe',
        traces: [
          { chartType: 'line', xAxis: '$.week', yAxis: '$.order_count' }
        ]
      },
        dataProfile: {
          rowCount: 12,
          columns: [
            { name: 'week', generator: 'linear', start: 1, end: 12, step: 1 },
            { name: 'order_count', generator: 'normal', mean: 200, stddev: 50, min: 50, max: 400 }
          ]
        },
        assumptions: ['created_at is present']
      }
    ],
    realData: null
  })

  renderApp()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })

  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  await waitFor(() => expect(callGenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })

  expect(await screen.findByRole('heading', { name: /insight candidates/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
})
