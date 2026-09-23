import { fireEvent, render, screen } from '@testing-library/preact'
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

vi.mock('../services/apiClient', () => ({
  editChart: vi.fn().mockResolvedValue({ plotlyData: [], plotlyLayout: {} }),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
}))

// react-remove-scroll ships CJS whose require('react') bypasses the preact
// alias under vitest; its scroll lock is irrelevant to these tests.
vi.mock('react-remove-scroll', () => ({
  RemoveScroll: ({ children }: { children: unknown }) => <>{children}</>,
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

it('keeps plot prop identities stable across unrelated state changes', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  // Opening the combine modal re-renders the carousel, but the Plot props
  // must keep their identities: react-plotly.js compares props with === and
  // re-runs Plotly.react whenever layout/data/config identity changes.
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

it('re-renders the plot with fresh identities when the chart changes', () => {
  const onDelete = vi.fn()

  renderCarousel({ insights, sessionId: 'test-session', onDelete })

  const before = plotRenders.length
  fireEvent.click(screen.getByRole('button', { name: /\u2192/ }))

  expect(plotRenders.length).toBeGreaterThan(before)
  const last = plotRenders[plotRenders.length - 1]
  const previous = plotRenders[plotRenders.length - 2]
  expect(last.data).not.toBe(previous.data)
  expect(last.layout).not.toBe(previous.layout)
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
    traces: [],
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

  fireEvent.click(screen.getByLabelText(/chart type/i, { selector: 'input' }))
  fireEvent.click(await screen.findByRole('option', { name: /line/i }))

  const img = await screen.findByRole('img', { name: /huge scatter/i })
  expect(img.getAttribute('src') ?? '').toMatch(/^data:image\/svg\+xml/)
  expect(screen.getByRole('button', { name: /reset chart/i })).toBeInTheDocument()
})
