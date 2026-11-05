import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import { InsightChart } from './InsightChart'
import Plotly from '../lib/plotly-bundle'

const state = vi.hoisted(() => ({
  intersecting: null as boolean | null,
  instances: [] as Array<{ deliver: (entries: Array<{ isIntersecting: boolean }>) => void }>,
  resizeObservers: [] as Array<{ deliver: () => void }>,
  plotRenders: [] as Array<{ data: unknown; layout: unknown; config: unknown }>,
}))

class IntersectionObserverStub {
  callback: (entries: Array<{ isIntersecting: boolean }>) => void
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    this.callback = callback
    state.instances.push({ deliver: (entries) => this.callback(entries) })
  }
  observe() {
    if (state.intersecting !== null) {
      this.callback([{ isIntersecting: state.intersecting }])
    }
  }
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub)

class ResizeObserverStub {
  callback: () => void
  constructor(callback: () => void) {
    this.callback = callback
    state.resizeObservers.push({ deliver: () => this.callback() })
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

vi.mock('react-plotly.js', () => ({
  default: (props: {
    data: Array<{ type?: string }>
    layout: unknown
    config: unknown
    onInitialized?: (figure: unknown, graphDiv: HTMLElement) => void
  }) => {
    state.plotRenders.push({ data: props.data, layout: props.layout, config: props.config })
    const graphDiv = document.createElement('div')
    document.body.appendChild(graphDiv)
    props.onInitialized?.({}, graphDiv)
    return <div data-testid="plotly-chart" />
  },
}))

vi.mock('../lib/plotly-bundle', () => ({
  ensureTraceModules: vi.fn().mockResolvedValue(undefined),
  default: { Plots: { resize: vi.fn() } },
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
  state.intersecting = null
  state.instances.length = 0
  state.resizeObservers.length = 0
  state.plotRenders.length = 0
  vi.mocked(Plotly.Plots.resize).mockClear()
})

it('resizes the plot when its cell container changes size', async () => {
  state.intersecting = true
  const onGraphDivChange = vi.fn()
  renderChart(liveInsight, null, onGraphDivChange)

  await screen.findByTestId('plotly-chart')
  expect(state.resizeObservers.length).toBeGreaterThan(0)

  state.resizeObservers.forEach((observer) => observer.deliver())

  const graphDiv = onGraphDivChange.mock.calls[0]?.[0] as HTMLElement
  expect(Plotly.Plots.resize).toHaveBeenCalledWith(graphDiv)
})

it('mounts a live plot for in-viewport cards and reports the graph div', async () => {
  state.intersecting = true
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

it('shows a skeleton when never in viewport, fetching no thumbnail', () => {
  state.intersecting = false
  renderChart(liveInsight)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument()
})

it('keeps the plot mounted once seen, even when the card leaves the viewport', async () => {
  state.intersecting = true
  renderChart(liveInsight)
  await screen.findByTestId('plotly-chart')

  state.intersecting = false
  await act(async () => {
    state.instances.forEach((instance) => instance.deliver([{ isIntersecting: false }]))
  })

  expect(screen.getByTestId('plotly-chart')).toBeInTheDocument()
})

it('skips plotly resize once the plot div is detached', async () => {
  state.intersecting = true
  const onGraphDivChange = vi.fn()
  const view = renderChart(liveInsight, null, onGraphDivChange)
  await screen.findByTestId('plotly-chart')

  state.resizeObservers.forEach((observer) => observer.deliver())
  expect(Plotly.Plots.resize).toHaveBeenCalledTimes(1)

  const graphDiv = onGraphDivChange.mock.calls[0]?.[0] as HTMLElement
  view.unmount()
  graphDiv.remove()
  state.resizeObservers.forEach((observer) => observer.deliver())
  expect(Plotly.Plots.resize).toHaveBeenCalledTimes(1)
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

it('renders a skeleton until the first viewport observation, fetching no thumbnail', () => {
  state.intersecting = null
  renderChart(liveInsight)
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument()
})

it('keeps plot prop identities stable across unrelated re-renders', async () => {
  state.intersecting = true
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
