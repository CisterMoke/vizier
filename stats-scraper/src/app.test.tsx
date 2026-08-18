import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { App } from './app'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

const mapCanonicalSchemaMock = vi.fn()
const generateInsightsMock = vi.fn()

vi.mock('./services/llmProvider', () => ({
  createLLMProvider: () => ({
    mapCanonicalSchema: mapCanonicalSchemaMock,
    generateInsights: generateInsightsMock
  })
}))

beforeEach(() => {
  mapCanonicalSchemaMock.mockReset()
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
  expect(mapCanonicalSchemaMock).not.toHaveBeenCalled()
})

it('maps schema with llm and generates chart cards', async () => {
  mapCanonicalSchemaMock.mockResolvedValue({
    entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
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
      chartRecommendation: 'line',
      assumptions: ['created_at is present']
    }
  ])

  renderApp()

  fireEvent.input(screen.getByLabelText(/api key/i), { target: { value: 'demo-key' } })
  fireEvent.click(screen.getByRole('button', { name: /map schema with ai/i }))

  await waitFor(() => expect(mapCanonicalSchemaMock).toHaveBeenCalled())

  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))

  expect(await screen.findByRole('heading', { name: /insight candidates/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
})
