import { useEffect } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { WorkspaceProvider, useWorkspace } from '../store/workspace'
import type { InsightCandidate } from '../domain/types'
import type { InsightEdit } from '../domain/chartEdit'
import { InsightEditorModal } from './InsightEditorModal'

vi.mock('../services/apiClient', () => ({
  editChart: vi.fn().mockResolvedValue({ plotlyData: [], plotlyLayout: {}, isStatic: false, staticSvg: null }),
  insightSvgUrl: (sessionId: string, insightId: string) =>
    `/api/session/${sessionId}/insight/${insightId}/svg`,
}))

import { editChart } from '../services/apiClient'

const insight: InsightCandidate = {
  id: 'ins-1',
  metadata: {
    title: 'Revenue by category',
    summary: 'Show revenue by category as a bar chart.',
    description: 'Long description text.',
  },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.category', y_axis: '$.revenue' }],
    plotlyData: [{ type: 'bar', x: ['A'], y: [1] }],
    plotlyLayout: {},
  },
}

const SCHEMA = {
  source: 'orders',
  fields: [
    { name: 'Category', jsonPath: '$.category', type: 'string' },
    { name: 'Revenue', jsonPath: '$.revenue', type: 'number' },
    { name: 'Week', jsonPath: '$.week', type: 'string' },
  ],
}

const EditSeed = ({ edit }: { edit: InsightEdit }) => {
  const ws = useWorkspace()
  useEffect(() => {
    ws.setInsightEdit('ins-1', edit)
  }, [])
  return null
}

const renderModal = (props: Partial<Parameters<typeof InsightEditorModal>[0]> = {}, seed?: InsightEdit) =>
  render(
    <MantineProvider>
      <WorkspaceProvider>
        {seed ? <EditSeed edit={seed} /> : null}
        <InsightEditorModal
          insight={insight}
          schema={SCHEMA as never}
          sessionId="s1"
          opened
          onClose={vi.fn()}
          {...props}
        />
      </WorkspaceProvider>
    </MantineProvider>
  )

const lastTraces = (call: number) => (editChart as ReturnType<typeof vi.fn>).mock.calls[call][1]

beforeEach(() => {
  vi.clearAllMocks()
})

it('shows summary and description as read-only context', () => {
  renderModal()
  expect(screen.getByText(/show revenue by category/i)).toBeInTheDocument()
  expect(screen.getByText(/long description text/i)).toBeInTheDocument()
})

it('sends chart type changes through editChart with the session id', async () => {
  renderModal()
  fireEvent.click(screen.getByLabelText(/chart type/i, { selector: 'input' }))
  fireEvent.click(await screen.findByRole('option', { name: /^pie$/i }))
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
  expect((editChart as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('s1')
})

it('hides the field editor when no schema is present', () => {
  renderModal({ schema: null })
  expect(screen.queryByLabelText(/x axis/i, { selector: 'input' })).not.toBeInTheDocument()
})

it('rebuilds with a substituted x axis', async () => {
  renderModal()
  fireEvent.click(screen.getByLabelText(/x axis/i, { selector: 'input' }))
  fireEvent.click(await screen.findByRole('option', { name: 'Week' }))
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
  expect(lastTraces(0)[0].x_axis).toBe('$.week')
  expect(lastTraces(0)[0].y_axis).toBe('$.revenue')
})

it('lists only numeric fields for the y axis', async () => {
  renderModal()
  fireEvent.click(screen.getByLabelText(/y axis/i, { selector: 'input' }))
  const options = screen.getAllByRole('option').map((option) => option.textContent)
  expect(options).toContain('Revenue')
  expect(options).not.toContain('Category')
  expect(options).not.toContain('Week')
})

it('enabling a filter sends field, op, and value; disabling removes it', async () => {
  renderModal()
  fireEvent.click(screen.getByLabelText(/filter/i))
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
  expect(lastTraces(0)[0].filter).toEqual({ field: '$.category', op: 'eq', value: '' })

  fireEvent.input(await screen.findByLabelText(/value/i), { target: { value: 'EMEA' } })
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(2))
  expect(lastTraces(1)[0].filter).toEqual({ field: '$.category', op: 'eq', value: 'EMEA' })

  fireEvent.click(screen.getByLabelText(/filter/i))
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(3))
  expect(lastTraces(2)[0].filter).toBeNull()
})

it('clearing aggregation sends null', async () => {
  const withAgg: InsightCandidate = {
    ...insight,
    chart_spec: {
      traces: [{ chart_type: 'bar', x_axis: '$.category', y_axis: '$.revenue', aggregation: 'sum' }],
      plotlyData: [],
      plotlyLayout: {},
    },
  }
  renderModal({ insight: withAgg })
  fireEvent.click(screen.getByLabelText(/aggregation/i, { selector: 'input' }))
  fireEvent.click(await screen.findByRole('option', { name: 'None' }))
  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
  expect(lastTraces(0)[0].aggregation).toBeNull()
})

it('edits fields per trace for multi-trace insights', async () => {
  const multiTrace: InsightCandidate = {
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
  }
  const multiSchema = {
    source: 'orders',
    fields: [
      { name: 'Category', jsonPath: '$.category', type: 'string' },
      { name: 'Week', jsonPath: '$.week', type: 'string' },
      { name: 'Revenue', jsonPath: '$.revenue', type: 'number' },
      { name: 'Orders', jsonPath: '$.orders', type: 'number' },
    ],
  }
  renderModal({ insight: multiTrace, schema: multiSchema as never })

  fireEvent.click(screen.getByText('Trace 2'))
  const ySelect = screen.getAllByLabelText(/y axis/i, { selector: 'input' })[0]
  fireEvent.click(ySelect)
  fireEvent.click(await screen.findByRole('option', { name: 'Revenue' }))

  await waitFor(() => expect(editChart).toHaveBeenCalledTimes(1))
  expect(lastTraces(0)[1].y_axis).toBe('$.revenue')
  expect(lastTraces(0)[0].y_axis).toBe('$.revenue')
})

it('undoes all edits back to the original recipe without calling the backend', async () => {
  renderModal(undefined, { chartType: 'pie', traceEdits: {}, plotlyData: [], plotlyLayout: {}, staticSvg: null })
  const undo = await screen.findByRole('button', { name: /undo chart edit/i })
  fireEvent.click(undo)
  expect(editChart).not.toHaveBeenCalled()
})
