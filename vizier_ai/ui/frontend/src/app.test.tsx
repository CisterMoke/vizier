import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { Notifications, notificationsStore } from '@mantine/notifications'
import type { InsightCandidate } from './domain/types'

vi.mock('react-plotly.js', async () => {
  const { useEffect } = await import('react')
  return {
    default: (props: { onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void }) => {
      useEffect(() => {
        props.onInitialized?.({}, document.createElement('div'))
      }, [])
      return <div data-testid="plotly-chart" />
    },
  }
})

vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>()
  return { ...actual, useInViewport: () => ({ ref: () => {}, inViewport: true }) }
})

vi.mock('react-grid-layout/legacy', () => ({
  default: () => null,
  WidthProvider: (Wrapped: unknown) => (props: Record<string, unknown>) => (
    <div data-testid="grid-mock">{props.children as never}</div>
  ),
}))

vi.mock('./lib/plotly-bundle', () => ({
  ensureTraceModules: vi.fn().mockResolvedValue(undefined),
  default: { downloadImage: vi.fn() },
}))

vi.mock('./lib/download', () => ({
  saveInsightBundle: vi.fn(() => true),
  exportPlotImage: vi.fn(),
  downloadSvg: vi.fn(),
  slugify: vi.fn((text: string) => text),
}))

const callGenerateMock = vi.fn()
const regenerateMock = vi.fn()

vi.mock('./services/apiClient', () => ({
  callGenerate: (...args: unknown[]) => callGenerateMock(...args),
  regenerate: (...args: unknown[]) => regenerateMock(...args),
  editChart: vi.fn().mockResolvedValue({ plotlyData: [], plotlyLayout: {}, isStatic: false, staticSvg: null }),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
  fetchConfig: vi.fn().mockResolvedValue({ maxFileSize: null, maxRows: null }),
}))

import { App } from './app'

beforeEach(() => {
  callGenerateMock.mockReset()
  regenerateMock.mockReset()
})

const renderApp = () =>
  render(
    <MantineProvider>
      <Notifications />
      <App />
    </MantineProvider>
  )

const insight = (id: string, title: string): InsightCandidate => ({
  id,
  metadata: { title, summary: 'S', description: null },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: [{ type: 'bar', x: [1], y: [2] }],
    plotlyLayout: {},
  },
})

const generate = async () => {
  fireEvent.input(screen.getByLabelText(/data description/i), { target: { value: 'orders(id int)' } })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  await waitFor(() => expect(callGenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
}

it('maps upload progress events to the progress bar', async () => {
  let emitEvent: (event: never) => void = () => {}
  callGenerateMock.mockImplementation(
    (_request: unknown, onProgress?: (event: never) => void) => {
      emitEvent = onProgress ?? (() => {})
      return new Promise(() => {})
    }
  )
  renderApp()
  await generate()

  act(() => {
    emitEvent({ type: 'upload', fraction: 0.5 } as never)
  })
  expect(screen.getByText('Uploading data… 50%')).toBeInTheDocument()
})

it('renders the studio shell with rail, panel, and empty state', () => {
  renderApp()
  expect(screen.getByText('V')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /generate insights/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /vizier ai/i })).toBeInTheDocument()
})

it('generates insights and shows them in the grid; inputs lock', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 's1',
    insights: [insight('i1', 'Orders trend')],
    context: null,
  })
  renderApp()
  await generate()
  expect(await screen.findByRole('heading', { name: /orders trend/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(1)
  expect(screen.getByLabelText(/data description/i)).toBeDisabled()
})

it('regenerate appends new cards to the grid', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 's1',
    insights: [insight('i1', 'First')],
    context: null,
  })
  regenerateMock.mockResolvedValue({ sessionId: 's1', insights: [insight('i2', 'Second')], context: null })
  renderApp()
  await generate()
  fireEvent.click(screen.getByRole('button', { name: /regenerate insights/i }))
  await waitFor(() => expect(regenerateMock).toHaveBeenCalledTimes(1), { timeout: 10000 })
  expect(await screen.findByRole('heading', { name: /second/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /first/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(2)
})

it('deleting a card shows an undo notification that restores it', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 's1',
    insights: [insight('i1', 'Solo')],
    context: null,
  })
  renderApp()
  await generate()
  fireEvent.click(screen.getByRole('button', { name: /delete insight/i }))
  expect(await screen.findByRole('button', { name: /undo/i })).toBeInTheDocument()
  expect(screen.queryByTestId('chart-card')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /undo/i }))
  expect(await screen.findByTestId('chart-card')).toBeInTheDocument()
})

it('undoing one delete keeps the other undo toast available', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 's1',
    insights: [insight('i1', 'First'), insight('i2', 'Second')],
    context: null,
  })
  renderApp()
  await generate()
  await screen.findAllByTestId('chart-card')
  fireEvent.click(screen.getAllByRole('button', { name: /delete insight/i })[0])
  await screen.findByRole('button', { name: /undo/i })
  fireEvent.click(screen.getAllByRole('button', { name: /delete insight/i })[0])
  const undoToasts = await screen.findAllByRole('button', { name: /undo/i })
  expect(undoToasts).toHaveLength(2)

  fireEvent.click(undoToasts[0])
  expect(await screen.findAllByTestId('chart-card')).toHaveLength(1)

  // Only the undone card's toast is removed from the store; the other
  // stays available and functional. (Exiting toasts linger in the DOM in
  // jsdom — no transitionend — so the store is the source of truth here.)
  expect(notificationsStore.getState().notifications).toHaveLength(1)
  const otherUndo = screen
    .getAllByRole('button', { name: /undo/i })
    .find((btn) => btn !== undoToasts[0])
  expect(otherUndo).toBeDefined()
  fireEvent.click(otherUndo as HTMLElement)
  expect(await screen.findAllByTestId('chart-card')).toHaveLength(2)
})

it('reset via the panel clears the grid and unlocks inputs', async () => {
  callGenerateMock.mockResolvedValue({
    sessionId: 's1',
    insights: [insight('i1', 'Solo')],
    context: null,
  })
  renderApp()
  await generate()
  fireEvent.click(screen.getByRole('button', { name: /reset workspace/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^reset$/i }))
  expect(screen.getByLabelText(/data description/i)).toBeEnabled()
  expect(screen.getByRole('button', { name: /^generate insights/i })).toBeEnabled()
  expect(screen.getByRole('heading', { name: /vizier ai/i })).toBeInTheDocument()
})

it('shows the checkpointed progress bar while generating', async () => {
  callGenerateMock.mockImplementation(
    (_request: unknown, onProgress?: (event: never) => void) =>
      new Promise((resolve) => {
        onProgress?.({ type: 'prepare', rowCount: 4 } as never)
        onProgress?.({ type: 'schema', fieldCount: 3, warnings: [] } as never)
        onProgress?.({ type: 'insights', count: 2 } as never)
        onProgress?.({ type: 'chart', index: 0, total: 2, insightId: 'i1', title: 'T1' } as never)
        setTimeout(() => resolve({ sessionId: 's', insights: [], context: null }), 150)
      })
  )
  renderApp()
  fireEvent.input(screen.getByLabelText(/data description/i), { target: { value: 'orders(id int)' } })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  await screen.findByText(/building chart 1 of 2/i)
  await waitFor(
    () => expect(screen.queryByTestId('generation-progress')).not.toBeInTheDocument(),
    { timeout: 8000 }
  )
})

it('shows an error toast when generation fails', async () => {
  callGenerateMock.mockRejectedValue(new Error('LLM is down'))
  renderApp()
  await generate()
  expect(await screen.findByText('LLM is down')).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByTestId('generation-progress')).not.toBeInTheDocument()
  )
})
