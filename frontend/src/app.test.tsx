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

  expect(screen.getByRole('heading', { name: /vizier ai/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate analytics/i })).toBeInTheDocument()
})

it('calls backend API on generate and renders chart cards', async () => {
  callGenerateMock.mockResolvedValue({
    insights: [
      {
        id: 'insight-1',
        title: 'Orders trend',
        summary: 'Orders over time',
        keyIdea: 'Orders climb weekly',
        metricDescription: 'Weekly order count',
        assumptions: ['created_at is present'],
        plotlyData: [{ type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [10, 20, 30] }],
        plotlyLayout: { title: { text: 'Orders trend' } }
      }
    ]
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
