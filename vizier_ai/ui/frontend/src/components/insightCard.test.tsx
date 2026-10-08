import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import { InsightCard, SHOW_SUMMARY } from './InsightCard'
import { WorkspaceProvider, useWorkspace } from '../store/workspace'

vi.mock('./InsightChart', () => ({
  InsightChart: () => <div data-testid="insight-chart" />,
}))

vi.mock('../lib/download', () => ({
  saveInsightBundle: vi.fn(() => true),
  exportPlotImage: vi.fn(),
  downloadSvg: vi.fn(),
}))

import { saveInsightBundle } from '../lib/download'

const liveInsight: InsightCandidate = {
  id: 'ins-1',
  metadata: { title: 'Revenue by category', summary: 'A summary sentence.', description: null },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }],
    plotlyData: [{ type: 'bar', x: [1], y: [2] }],
    plotlyLayout: {},
  },
}

const staticInsight: InsightCandidate = {
  id: 'ins-2',
  metadata: { title: 'Huge', summary: 'S', description: null },
  chart_spec: { traces: [], plotlyData: null, plotlyLayout: null, isStatic: true },
}

const SCHEMA_CONTEXT = { schema: { source: 's', fields: [] }, dataProfile: null }

const renderCard = (insight: InsightCandidate, context = SCHEMA_CONTEXT) =>
  render(
    <MantineProvider>
      <WorkspaceProvider>
        <InsightCard insight={insight} sessionId="s1" bundleContext={context} onEdit={vi.fn()} onDelete={vi.fn()} />
      </WorkspaceProvider>
    </MantineProvider>
  )

it('renders title, summary (gated by SHOW_SUMMARY), and the chart', () => {
  renderCard(liveInsight)
  expect(screen.getByRole('heading', { name: /revenue by category/i })).toBeInTheDocument()
  if (SHOW_SUMMARY) {
    expect(screen.getByText(/a summary sentence/i)).toBeInTheDocument()
  }
  expect(screen.getByTestId('insight-chart')).toBeInTheDocument()
})

it('exposes edit and delete actions', () => {
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <MantineProvider>
      <WorkspaceProvider>
        <InsightCard insight={liveInsight} sessionId="s1" bundleContext={SCHEMA_CONTEXT} onEdit={onEdit} onDelete={onDelete} />
      </WorkspaceProvider>
    </MantineProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: /edit chart/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete insight/i }))
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('save bundle shows the disabled state and tooltip affordance without schema context', () => {
  renderCard(liveInsight, null)
  const save = screen.getByRole('button', { name: /save insight bundle/i }) as HTMLButtonElement
  expect(save.disabled).toBe(false)
  expect(save.hasAttribute('data-disabled')).toBe(true)
  fireEvent.click(save)
  expect(saveInsightBundle).not.toHaveBeenCalled()
})

it('save bundle downloads through the helper with schema context', () => {
  renderCard(liveInsight)
  fireEvent.click(screen.getByRole('button', { name: /save insight bundle/i }))
  expect(saveInsightBundle).toHaveBeenCalledWith(liveInsight, SCHEMA_CONTEXT)
})

it('image export is enabled for static insights without a live graph div', () => {
  renderCard(staticInsight)
  expect((screen.getByRole('button', { name: /export chart image/i }) as HTMLButtonElement).disabled).toBe(false)
})

it('image export is disabled for live insights until the graph div is reported', () => {
  renderCard(liveInsight)
  expect((screen.getByRole('button', { name: /export chart image/i }) as HTMLButtonElement).disabled).toBe(true)
})

it('shows the edited dot and undo action only when an edit exists, and undo clears it', () => {
  const EditedProbe = () => {
    const workspace = useWorkspace()
    return (
      <>
        <button
          onClick={() => workspace.setInsightEdit('ins-1', {
            chartType: 'pie', traceEdits: {}, plotlyData: null, plotlyLayout: null, staticSvg: null,
          })}
        >
          store-edit
        </button>
        <InsightCard insight={liveInsight} sessionId="s1" bundleContext={SCHEMA_CONTEXT} onEdit={vi.fn()} onDelete={vi.fn()} />
      </>
    )
  }
  render(
    <MantineProvider>
      <WorkspaceProvider>
        <EditedProbe />
      </WorkspaceProvider>
    </MantineProvider>
  )
  expect(screen.queryByTestId('edited-dot')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /store-edit/i }))
  expect(screen.getByTestId('edited-dot')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /undo chart edit/i }))
  expect(screen.queryByTestId('edited-dot')).not.toBeInTheDocument()
})
