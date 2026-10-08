import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import { InsightChart } from './InsightChart'

const state = vi.hoisted(() => ({ inViewport: true, plotRenders: [] as Array<{ data: unknown; layout: unknown; config: unknown }> }))

vi.mock('@mantine/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/hooks')>()
  return {
    ...actual,
    useInViewport: () => ({ ref: () => {}, inViewport: state.inViewport }),
  }
})

vi.mock('react-plotly.js', () => ({
  default: (props: {
    data: Array<{ type?: string }>
    layout: unknown
    config: unknown
    onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void
  }) => {
    state.plotRenders.push({ data: props.data, layout: props.layout, config: props.config })
    props.onInitialized?.({}, document.createElement('div'))
    return <div data-testid="plotly-chart" />
  },
}))

vi.mock('../lib/plotly-bundle', () => ({
  ensureTraceModules: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../services/apiClient', () => ({
  editChart: vi.fn(),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
}))

const liveInsight: InsightCandidate = {
  id: 'ins-1',
  metadata: { title: 'Revenue', summary: 'S', description: null },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: [{ type: 'bar', x: ['A'], y: [1] }],
    plotlyLayout: { title: { text: 'Revenue' } },
  },
}

const staticInsight: InsightCandidate = {
  id: 'ins-static',
  metadata: { title: 'Huge scatter', summary: 'S', description: null },
  chart_spec: {
    traces: [{ chart_type: 'scatter', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: null,
    plotlyLayout: null,
    isStatic: true,
  },
}

const renderChart = (insight: InsightCandidate, edit = null, onGraphDivChange?: (div: HTMLElement | null) => void) =>
  render(
    <MantineProvider>
      <InsightChart insight={insight} edit={edit} sessionId="s1" onGraphDivChange={onGraphDivChange} />
    </MantineProvider>
  )

beforeEach(() => {
  state.inViewport = true
  state.plotRenders.length = 0
})

it('mounts a live plot for in-viewport cards and reports the graph div', async () => {
  const onGraphDivChange = vi.fn()
  renderChart(liveInsight, null, onGraphDivChange)
  await screen.findByTestId('plotly-chart')
  expect(onGraphDivChange).toHaveBeenCalledWith(expect.any(HTMLElement))
})

it('renders the static svg for static insights and never mounts a plot', () => {
  renderChart(staticInsight)
  const img = screen.getByRole('img', { name: /huge scatter/i })
  expect(img.getAttribute('src')).toBe('/api/session/s1/insight/ins-static/svg')
  expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument()
  expect(screen.getByText(/static preview/i)).toBeInTheDocument()
})

it('shows a thumbnail instead of a plot when out of viewport', () => {
  state.inViewport = false
  renderChart(liveInsight)
  expect(screen.getByRole('img', { name: /revenue/i }).getAttribute('src')).toBe(
    '/api/session/s1/insight/ins-1/svg'
  )
  expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument()
})

it('prefers an edited static svg over the session endpoint', () => {
  renderChart(staticInsight, {
    chartType: 'line',
    traceEdits: {},
    plotlyData: null,
    plotlyLayout: null,
    staticSvg: '<svg>edited</svg>',
  })
  expect(screen.getByRole('img').getAttribute('src') ?? '').toMatch(/^data:image\/svg\+xml/)
})

it('keeps plot prop identities stable across unrelated re-renders', async () => {
  const Stateful = () => {
    const [tick, setTick] = useState(0)
    return (
      <MantineProvider>
        <button onClick={() => setTick(tick + 1)}>rerender</button>
        <InsightChart insight={liveInsight} edit={null} sessionId="s1" />
      </MantineProvider>
    )
  }
  render(<Stateful />)
  await screen.findByTestId('plotly-chart')
  const before = state.plotRenders[state.plotRenders.length - 1]
  fireEvent.click(screen.getByRole('button', { name: /rerender/i }))
  const after = state.plotRenders[state.plotRenders.length - 1]
  expect(after.data).toBe(before.data)
  expect(after.layout).toBe(before.layout)
  expect(after.config).toBe(before.config)
})
