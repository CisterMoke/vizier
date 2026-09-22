import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

const callGenerateMock = vi.fn()
const regenerateMock = vi.fn()
const loadBundleMock = vi.fn()

vi.mock('./services/apiClient', () => ({
  callGenerate: (...args: unknown[]) => callGenerateMock(...args),
  regenerate: (...args: unknown[]) => regenerateMock(...args),
  loadBundle: (...args: unknown[]) => loadBundleMock(...args),
  editChart: vi.fn(),
  fetchConfig: vi.fn().mockResolvedValue({ maxFileSize: null, maxRows: null }),
}))

import { App } from './app'

beforeEach(() => {
  callGenerateMock.mockReset()
  regenerateMock.mockReset()
  loadBundleMock.mockReset()
})

const renderApp = () => render(<MantineProvider><App /></MantineProvider>)

const selectFile = (input: HTMLElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const bundleInput = () =>
  document.querySelector('input[type="file"][name="bundle-file"]') as HTMLElement

it('renders analytics idea lab shell', () => {
  renderApp()

  expect(screen.getByRole('heading', { name: /vizier ai/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate analytics/i })).toBeInTheDocument()
})

it('calls backend API on generate and renders chart cards', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 'test-session',
    insights: [
      {
        id: 'insight-1',
        metadata: {
          title: 'Orders trend',
          summary: 'Orders over time',
          keyIdea: 'Orders climb weekly',
          description: null,
        },
        chart_spec: {
          traces: [],
          plotlyData: [{ type: 'scatter', mode: 'lines+markers', x: [1, 2, 3], y: [10, 20, 30] }],
          plotlyLayout: { title: { text: 'Orders trend' } }
        }
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

it('sends constraints with the generate request', async () => {
  callGenerateMock.mockResolvedValue({ sessionId: 'test-session', insights: [] })

  renderApp()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.input(screen.getByLabelText(/guidance/i), {
    target: { value: '  focus on trends  ' }
  })

  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  await waitFor(() => expect(callGenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })

  const request = callGenerateMock.mock.calls[0][0]
  expect(request.constraints).toEqual({ guidance: 'focus on trends' })
})

it('sends constraints with the regenerate request', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 'session-42',
    insights: [
      {
        id: 'insight-1',
        metadata: { title: 'T', summary: 'S', keyIdea: 'K', description: null },
        chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} }
      }
    ]
  })
  regenerateMock.mockResolvedValue({ sessionId: 'session-42', insights: [], context: null })

  renderApp()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  await waitFor(() => expect(callGenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })

  fireEvent.input(screen.getByLabelText(/guidance/i), {
    target: { value: 'compare regions' }
  })
  fireEvent.click(screen.getByRole('button', { name: /regenerate insights/i }))

  await waitFor(() => expect(regenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
  expect(regenerateMock.mock.calls[0][0]).toBe('session-42')
  expect(regenerateMock.mock.calls[0][1]).toEqual({ guidance: 'compare regions' })
})

it('renders the download button and enables it once insights exist', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 'session-9',
    insights: [
      {
        id: 'insight-1',
        metadata: { title: 'T', summary: 'S', keyIdea: 'K', description: null },
        chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} }
      }
    ],
    context: { schema: { source: 's', fields: [] }, dataProfile: null }
  })

  renderApp()

  expect(screen.getByRole('button', { name: /download bundle/i })).toBeDisabled()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  await waitFor(() => expect(callGenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })

  await waitFor(() => expect(screen.getByRole('button', { name: /download bundle/i })).not.toBeDisabled())
})

it('loads a bundle through the import section', async () => {
  loadBundleMock.mockResolvedValue({
    sessionId: 'session-import',
    insights: [
      {
        id: 'imported-1',
        metadata: { title: 'T', summary: 'S', keyIdea: 'K', description: null },
        chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} },
        mock_seed: 1337
      }
    ],
    context: { schema: { source: 's', fields: [] }, dataProfile: { columns: [] } }
  })

  renderApp()

  const bundleFile = new File(['{}'], 'bundle.json', { type: 'application/json' })
  selectFile(bundleInput(), bundleFile)

  const loadButton = screen.getByRole('button', { name: /^load bundle$/i })
  await waitFor(() => expect(loadButton).not.toBeDisabled())
  fireEvent.click(loadButton)

  await waitFor(() => expect(loadBundleMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
  expect(loadBundleMock.mock.calls[0][0]).toBe(bundleFile)

  expect(await screen.findAllByTestId('chart-card')).toHaveLength(1)
})
