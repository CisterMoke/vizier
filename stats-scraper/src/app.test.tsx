import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { App } from './app'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

const mapSchemaMock = vi.fn()
const generateInsightsMock = vi.fn()

vi.mock('./services/llmProvider', () => ({
  createLLMProvider: () => ({
    mapSchema: mapSchemaMock,
    generateInsights: generateInsightsMock
  })
}))

beforeEach(() => {
  mapSchemaMock.mockReset()
  generateInsightsMock.mockReset()
})

const renderApp = () => render(<MantineProvider><App /></MantineProvider>)

it('renders analytics idea lab shell', () => {
  renderApp()

  expect(screen.getByRole('heading', { name: /analytics idea lab/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /map schema with ai/i })).toBeInTheDocument()
})

it('requires api key for schema mapping', async () => {
  renderApp()

  fireEvent.click(screen.getByRole('button', { name: /map schema with ai/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/provide an api key/i)
  expect(mapSchemaMock).not.toHaveBeenCalled()
})

it('maps schema with llm and generates chart cards', async () => {
  mapSchemaMock.mockResolvedValue({
    source: 'SQL: orders table',
    fields: [
      { name: 'id', type: 'number', nullable: false, semanticType: 'identifier' },
      { name: 'total', type: 'number', nullable: false, semanticType: 'currency' }
    ],
    warnings: []
  })

  generateInsightsMock.mockResolvedValue([
    {
      id: 'insight-1',
      title: 'Orders trend',
      summary: 'Orders over time',
      confidence: 0.82,
      hypothesis: 'Orders climb weekly',
      metricDescription: 'Weekly order count',
      chartSpec: {
        mode: 'recipe',
        chartType: 'line',
        xAxis: { column: 'week', aggregation: 'none' },
        yAxis: { column: 'order_count', aggregation: 'none' }
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
  ])

  renderApp()

  fireEvent.input(screen.getByLabelText(/api key/i), { target: { value: 'demo-key' } })
  fireEvent.click(screen.getByRole('button', { name: /map schema with ai/i }))

  await waitFor(() => expect(mapSchemaMock).toHaveBeenCalled())

  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))

  expect(await screen.findByRole('heading', { name: /insight candidates/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
})
