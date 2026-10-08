import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

vi.mock('./lib/plotly-bundle', () => ({
  ensureTraceModules: vi.fn().mockResolvedValue(undefined)
}))

const callGenerateMock = vi.fn()
const regenerateMock = vi.fn()
const loadBundleMock = vi.fn()

vi.mock('./services/apiClient', () => ({
  callGenerate: (...args: unknown[]) => callGenerateMock(...args),
  regenerate: (...args: unknown[]) => regenerateMock(...args),
  loadBundle: (...args: unknown[]) => loadBundleMock(...args),
  editChart: vi.fn(),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
  fetchConfig: vi.fn().mockResolvedValue({ maxFileSize: null, maxRows: null }),
}))

import { App } from './app'

beforeEach(() => {
  callGenerateMock.mockReset()
  regenerateMock.mockReset()
  loadBundleMock.mockReset()
})

const renderApp = () => render(<MantineProvider><Notifications /><App /></MantineProvider>)

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
  fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
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
        metadata: { title: 'T', summary: 'S', description: null },
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

  fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
  fireEvent.input(screen.getByLabelText(/guidance/i), {
    target: { value: 'compare regions' }
  })
  fireEvent.click(screen.getByRole('button', { name: /regenerate insights/i }))

  await waitFor(() => expect(regenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
  expect(regenerateMock.mock.calls[0][0]).toBe('session-42')
  expect(regenerateMock.mock.calls[0][1]).toEqual({ guidance: 'compare regions' })
})

it('loads a bundle through the import section', async () => {
  loadBundleMock.mockResolvedValue({
    sessionId: 'session-import',
    insights: [
      {
        id: 'imported-1',
        metadata: { title: 'T', summary: 'S', description: null },
        chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} },
        mock_seed: 1337
      }
    ],
    context: { schema: { source: 's', fields: [] }, dataProfile: { columns: [] } }
  })

  renderApp()

  const bundleFile = new File(['{}'], 'bundle.json', { type: 'application/json' })
  selectFile(bundleInput(), bundleFile)

  const loadButton = await screen.findByRole('button', { name: /^load$/i })
  fireEvent.click(loadButton)

  await waitFor(() => expect(loadBundleMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
  expect(loadBundleMock.mock.calls[0][0]).toBe(bundleFile)

  expect(await screen.findAllByTestId('chart-card')).toHaveLength(1)
})

it('shows a checkpointed progress bar while generating and clears it after', async () => {
  callGenerateMock.mockImplementation(
    (_request: unknown, onProgress?: (event: never) => void) =>
      new Promise((resolve) => {
        onProgress?.({ type: 'prepare', rowCount: 4 } as never)
        onProgress?.({ type: 'schema', fieldCount: 3, warnings: [] } as never)
        onProgress?.({ type: 'insights', count: 2 } as never)
        onProgress?.({ type: 'chart', index: 0, total: 2, insightId: 'i1', title: 'T1' } as never)
        setTimeout(() => resolve({ sessionId: 's', insights: [] }), 150)
      })
  )

  renderApp()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  const panel = await screen.findByTestId('generation-progress')
  expect(panel).toHaveTextContent('Building chart 1 of 2')
  expect(screen.getByTestId('checkpoint-schema')).toBeInTheDocument()

  await waitFor(
    () => expect(screen.queryByTestId('generation-progress')).not.toBeInTheDocument(),
    { timeout: 4000 }
  )
})

it('shows an error toast when generation fails', async () => {
  callGenerateMock.mockRejectedValue(new Error('LLM is down'))

  renderApp()

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  expect(await screen.findByText('LLM is down')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByTestId('generation-progress')).not.toBeInTheDocument()
  )
})
