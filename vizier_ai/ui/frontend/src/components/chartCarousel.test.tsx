import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import { ChartCarousel } from './ChartCarousel'

const { plotRenders } = vi.hoisted(() => ({
  plotRenders: [] as Array<{ data: unknown; layout: unknown; config: unknown }>
}))

vi.mock('react-plotly.js', () => ({
  default: (props: { data: Array<{ type?: string }>; layout: unknown; config: unknown }) => {
    plotRenders.push({ data: props.data, layout: props.layout, config: props.config })
    return (
      <div data-testid="plotly-chart" data-trace-type={props.data[0]?.type ?? 'unknown'} />
    )
  }
}))

vi.mock('../lib/plotly-bundle', () => ({
  ensureTraceModules: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../services/apiClient', () => ({
  editChart: vi.fn().mockResolvedValue({ plotlyData: [], plotlyLayout: {} }),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
}))

const insights: InsightCandidate[] = [
  {
    id: 'ins-1',
    metadata: {
      title: 'Revenue by category',
      summary: 'Show revenue by category as a bar chart.',
      description: null,
    },
    chart_spec: {
      traces: [{ chart_type: 'bar', x_axis: '$.category', y_axis: '$.revenue' }],
      plotlyData: [{ type: 'bar', x: ['A', 'B'], y: [120, 95] }],
      plotlyLayout: { title: { text: 'Revenue' } }
    }
  },
  {
    id: 'ins-2',
    metadata: {
      title: 'Order volume trend',
      summary: 'Weekly order count over time.',
      description: null,
    },
    chart_spec: {
      traces: [{ chart_type: 'line', x_axis: '$.week', y_axis: '$.orders' }],
      plotlyData: [{ type: 'scatter', mode: 'lines+markers', x: [1, 2], y: [150, 220] }],
      plotlyLayout: { title: { text: 'Volume' } }
    }
  }
]

const SCHEMA = {
  source: 'orders',
  fields: [
    { name: 'Category', jsonPath: '$.category', type: 'string' },
    { name: 'Revenue', jsonPath: '$.revenue', type: 'number' },
    { name: 'Week', jsonPath: '$.week', type: 'string' },
  ],
}

const renderCarousel = (props: any) =>
  render(
    <div id="portal-root">
      <MantineProvider>
        <ChartCarousel {...props} />
      </MantineProvider>
    </div>
  )

const chartTypeInput = () =>
  screen.getByLabelText(/chart type/i, { selector: 'input' }) as HTMLInputElement

const lastRender = () => plotRenders[plotRenders.length - 1] as { data: Array<{ type?: string }> }

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

it('prefills the chart type from the insight recipe', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  expect(chartTypeInput().value).toBe('Bar')
  expect(screen.queryByRole('button', { name: /undo chart edit/i })).not.toBeInTheDocument()
})

it('keeps plot prop identities stable across unrelated state changes', async () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  // The chart only renders once its trace modules are ready.
  await screen.findByTestId('plotly-chart')

  // Opening the combine modal re-renders the carousel, but the chart props
  // must keep their identities: PlotlyChart re-plots (Plotly.react) whenever
  // layout/data/config identity changes.
  const before = plotRenders.length
  const beforeRender = plotRenders[before - 1]
  fireEvent.click(screen.getByRole('button', { name: /combine charts/i }))

  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(plotRenders.length).toBeGreaterThan(before)
  const after = plotRenders[plotRenders.length - 1]
  expect(after.layout).toBe(beforeRender.layout)
  expect(after.config).toBe(beforeRender.config)
  expect(after.data).toBe(beforeRender.data)
})

it('persists chart edits per insight while navigating', async () => {
  const onDelete = vi.fn()
  const { editChart } = await import('../services/apiClient')
  vi.mocked(editChart).mockResolvedValue({
    plotlyData: [{ type: 'pie', labels: ['A'], values: [1] }],
    plotlyLayout: { title: { text: 'Edited' } },
  })

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  // Edit chart 1 from bar to pie
  fireEvent.click(chartTypeInput())
  fireEvent.click(await screen.findByRole('option', { name: /^pie$/i }))
  await waitFor(() => expect(lastRender().data[0]?.type).toBe('pie'))

  // Navigate to chart 2: its own (unedited) chart is shown
  fireEvent.click(screen.getByRole('button', { name: /\u2192/ }))
  expect(screen.getByRole('heading', { name: /order volume trend/i })).toBeInTheDocument()
  await waitFor(() => expect(lastRender().data[0]?.type).toBe('scatter'))
  expect(chartTypeInput().value).toBe('Line')

  // Navigate back: chart 1 keeps its persisted pie edit
  fireEvent.click(screen.getByRole('button', { name: /\u2190/ }))
  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()
  await waitFor(() => expect(lastRender().data[0]?.type).toBe('pie'))
  expect(chartTypeInput().value).toBe('Pie')
})

it('undoes a chart edit back to the original chart', async () => {
  const onDelete = vi.fn()
  const { editChart } = await import('../services/apiClient')
  vi.mocked(editChart).mockResolvedValue({
    plotlyData: [{ type: 'pie', labels: ['A'], values: [1] }],
    plotlyLayout: { title: { text: 'Edited' } },
  })

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  fireEvent.click(chartTypeInput())
  fireEvent.click(await screen.findByRole('option', { name: /^pie$/i }))
  await waitFor(() => expect(lastRender().data[0]?.type).toBe('pie'))

  // The undo arrow appears only once the chart differs from the original
  const undo = screen.getByRole('button', { name: /undo chart edit/i })
  fireEvent.click(undo)

  await waitFor(() => expect(lastRender().data[0]?.type).toBe('bar'))
  expect(chartTypeInput().value).toBe('Bar')
  expect(screen.queryByRole('button', { name: /undo chart edit/i })).not.toBeInTheDocument()
})

const staticInsight: InsightCandidate = {
  id: 'ins-static',
  metadata: {
    title: 'Huge scatter',
    summary: 'Too many points for interactive rendering.',
    description: null,
  },
  chart_spec: {
    traces: [{ chart_type: 'scatter', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: null,
    plotlyLayout: null,
    isStatic: true,
  },
}

it('renders a static svg img for static insights instead of a plot', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights: [staticInsight], sessionId: 'test-session', onDelete })

  const img = screen.getByRole('img', { name: /huge scatter/i })
  expect(img.getAttribute('src')).toBe('/api/session/test-session/insight/ins-static/svg')
  expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument()
  expect(screen.getByText(/static preview/i)).toBeInTheDocument()
})

it('shows a server-rendered svg after editing a static chart', async () => {
  const onDelete = vi.fn()
  const { editChart } = await import('../services/apiClient')
  vi.mocked(editChart).mockResolvedValueOnce({
    plotlyData: null,
    plotlyLayout: null,
    isStatic: true,
    staticSvg: '<svg>edited</svg>',
  })

  renderCarousel({ insights: [staticInsight], sessionId: 'test-session', onDelete })

  fireEvent.click(chartTypeInput())
  fireEvent.click(await screen.findByRole('option', { name: /line/i }))

  const img = await screen.findByRole('img', { name: /huge scatter/i })
  expect(img.getAttribute('src') ?? '').toMatch(/^data:image\/svg\+xml/)
  expect(screen.getByRole('button', { name: /undo chart edit/i })).toBeInTheDocument()
})

describe('field editor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the field editor with axis and aggregation controls', () => {
    renderCarousel({ insights, sessionId: 'test-session', onDelete: vi.fn(), schema: SCHEMA })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))

    expect(screen.getByLabelText(/x axis/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/y axis/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/aggregation/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/filter/i)).toBeInTheDocument()
  })

  it('hides the editor when no schema is available', () => {
    renderCarousel({ insights, sessionId: 'test-session', onDelete: vi.fn() })

    expect(screen.queryByRole('button', { name: /edit fields/i })).not.toBeInTheDocument()
  })

  it('lists only numeric fields for the y axis plus the current field', () => {
    renderCarousel({ insights, sessionId: 'test-session', onDelete: vi.fn(), schema: SCHEMA })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))
    fireEvent.click(screen.getByLabelText(/y axis/i, { selector: 'input' }))

    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toContain('Revenue')
    expect(options).not.toContain('Category')
    expect(options).not.toContain('Week')
  })

  it('rebuilds the chart with a substituted x axis', async () => {
    const { editChart } = await import('../services/apiClient')
    renderCarousel({ insights, sessionId: 'test-session', onDelete: vi.fn(), schema: SCHEMA })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))
    fireEvent.click(screen.getByLabelText(/x axis/i, { selector: 'input' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Week' }))

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
    const traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(traces[0].x_axis).toBe('$.week')
    expect(traces[0].y_axis).toBe('$.revenue')
  })

  it('clearing aggregation sends null', async () => {
    const { editChart } = await import('../services/apiClient')
    const withAgg: InsightCandidate[] = [{
      id: 'ins-agg',
      metadata: { title: 'Agg', summary: 'S', description: null },
      chart_spec: {
        traces: [{ chart_type: 'bar', x_axis: '$.category', y_axis: '$.revenue', aggregation: 'sum' }],
        plotlyData: [],
        plotlyLayout: {},
      },
    }]

    renderCarousel({ insights: withAgg, sessionId: 'test-session', onDelete: vi.fn(), schema: SCHEMA })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))
    fireEvent.click(screen.getByLabelText(/aggregation/i, { selector: 'input' }))
    fireEvent.click(await screen.findByRole('option', { name: 'None' }))

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
    const traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(traces[0].aggregation).toBeNull()
  })

  it('enabling a filter sends field, op, and value; disabling removes it', async () => {
    const { editChart } = await import('../services/apiClient')
    renderCarousel({ insights, sessionId: 'test-session', onDelete: vi.fn(), schema: SCHEMA })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))
    fireEvent.click(screen.getByLabelText(/filter/i))

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
    let traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(traces[0].filter).toEqual({ field: '$.category', op: 'eq', value: '' })

    fireEvent.input(screen.getByLabelText(/value/i), { target: { value: 'EMEA' } })

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(2))
    traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[1][1]
    expect(traces[0].filter).toEqual({ field: '$.category', op: 'eq', value: 'EMEA' })

    fireEvent.click(screen.getByLabelText(/filter/i))

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(3))
    traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[2][1]
    expect(traces[0].filter).toBeNull()
  })

  it('edits fields per trace for multi-trace insights', async () => {
    const { editChart } = await import('../services/apiClient')
    const multiTrace: InsightCandidate[] = [{
      id: 'ins-multi',
      metadata: { title: 'Overlay', summary: 'S', description: null },
      chart_spec: {
        traces: [
          { chart_type: 'bar', x_axis: '$.category', y_axis: '$.revenue' },
          { chart_type: 'line', x_axis: '$.week', y_axis: '$.orders' },
        ],
        plotlyData: [],
        plotlyLayout: {},
      },
    }]
    const multiSchema = {
      source: 'orders',
      fields: [
        { name: 'Category', jsonPath: '$.category', type: 'string' },
        { name: 'Week', jsonPath: '$.week', type: 'string' },
        { name: 'Revenue', jsonPath: '$.revenue', type: 'number' },
        { name: 'Orders', jsonPath: '$.orders', type: 'number' },
      ],
    }

    renderCarousel({ insights: multiTrace, sessionId: 'test-session', onDelete: vi.fn(), schema: multiSchema })

    fireEvent.click(screen.getByRole('button', { name: /edit fields/i }))
    fireEvent.click(screen.getByText('Trace 2'))

    const ySelect = screen.getAllByLabelText(/y axis/i, { selector: 'input' })[0]
    fireEvent.click(ySelect)
    fireEvent.click(await screen.findByRole('option', { name: 'Revenue' }))

    await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
    const traces = (editChart as ReturnType<typeof vi.fn>).mock.calls[0][1]
    // the edit targeted the Orders trace: its y changed from $.orders to $.revenue
    expect(traces[1].y_axis).toBe('$.revenue')
    // the Revenue trace keeps its own field
    expect(traces[0].y_axis).toBe('$.revenue')
  })
})
