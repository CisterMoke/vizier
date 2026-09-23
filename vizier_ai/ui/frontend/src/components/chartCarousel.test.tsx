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
      keyIdea: 'Revenue varies by category.',
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
      keyIdea: 'Order volume shows seasonal patterns.',
      description: null,
    },
    chart_spec: {
      traces: [{ chart_type: 'line', x_axis: '$.week', y_axis: '$.orders' }],
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
    keyIdea: 'Server renders this chart instead.',
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
