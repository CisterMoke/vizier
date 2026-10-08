import { fireEvent, render, screen } from '@testing-library/react'
import { WorkspaceProvider, useWorkspace, type GenerationSnapshot, type RemovedInsight } from './workspace'
import type { InsightCandidate } from '../domain/types'
import type { InsightEdit } from '../domain/chartEdit'

const insight = (id: string): InsightCandidate => ({
  id,
  metadata: { title: `T ${id}`, summary: 'S', description: null },
  chart_spec: { traces: [{ chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }], plotlyData: [], plotlyLayout: {} },
})

const PIE_EDIT: InsightEdit = {
  chartType: 'pie',
  traceEdits: {},
  plotlyData: null,
  plotlyLayout: null,
  staticSvg: null,
}

const snapshot = (ids: string[]): GenerationSnapshot => ({
  sessionId: 's1',
  insights: ids.map(insight),
  context: { schema: { source: 'src', fields: [] }, dataProfile: null },
})

let api: ReturnType<typeof useWorkspace>
let removed: RemovedInsight | null

const Probe = () => {
  api = useWorkspace()
  return (
    <div>
      <button onClick={() => api.applyGeneration(snapshot(['a', 'b']))}>apply</button>
      <button onClick={() => api.appendInsights([insight('c')], null)}>append</button>
      <button onClick={() => { removed = api.removeInsight('a') }}>remove-a</button>
      <button onClick={() => { removed = api.removeInsight('b') }}>remove-b</button>
      <button onClick={() => api.restoreInsight(removed as RemovedInsight)}>restore</button>
      <button onClick={() => api.setInsightEdit('a', PIE_EDIT)}>edit-a</button>
      <button onClick={() => api.setInsightEdit('a', null)}>undo-a</button>
      <button onClick={() => api.setLayout([{ i: 'b', x: 0, y: 0, w: 8, h: 6 }])}>layout</button>
      <button onClick={() => api.resetWorkspace()}>reset</button>
      <div data-testid="locked">{String(api.locked)}</div>
      <div data-testid="count">{api.insights.length}</div>
      <div data-testid="session">{api.sessionId}</div>
      <div data-testid="layout-ids">{api.layout.map((item) => item.i).join(',')}</div>
      <div data-testid="edit-ids">{Object.keys(api.insightEdits).join(',')}</div>
    </div>
  )
}

const renderProbe = () => {
  api = undefined as never
  removed = null
  render(
    <WorkspaceProvider>
      <Probe />
    </WorkspaceProvider>
  )
}

it('starts unlocked with empty state', () => {
  renderProbe()
  expect(screen.getByTestId('locked').textContent).toBe('false')
  expect(screen.getByTestId('count').textContent).toBe('0')
  expect(screen.getByTestId('layout-ids').textContent).toBe('')
})

it('applyGeneration replaces everything, resets layout and edits, and locks', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /edit-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  expect(screen.getByTestId('count').textContent).toBe('2')
  expect(screen.getByTestId('layout-ids').textContent).toBe('a,b')
  expect(screen.getByTestId('edit-ids').textContent).toBe('')
  expect(screen.getByTestId('locked').textContent).toBe('true')
})

it('appendInsights appends below the existing layout and keeps edits', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /edit-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /append/i }))
  expect(screen.getByTestId('count').textContent).toBe('3')
  expect(screen.getByTestId('layout-ids').textContent).toBe('a,b,c')
  expect(screen.getByTestId('edit-ids').textContent).toBe('a')
})

it('removeInsight returns the removed insight with its layout entry and edit', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /edit-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /remove-a/i }))
  expect(removed?.insight.id).toBe('a')
  expect(removed?.layoutItem?.i).toBe('a')
  expect(removed?.edit?.chartType).toBe('pie')
  expect(screen.getByTestId('layout-ids').textContent).toBe('b')
})

it('removing the last insight unlocks the workspace', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /remove-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /remove-b/i }))
  expect(screen.getByTestId('locked').textContent).toBe('false')
  expect(screen.getByTestId('count').textContent).toBe('0')
})

it('restoreInsight re-adds exactly one layout entry after the layout changed, and restores edits', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /edit-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /remove-a/i }))
  fireEvent.click(screen.getByRole('button', { name: /layout/i }))
  fireEvent.click(screen.getByRole('button', { name: /restore/i }))
  expect(screen.getByTestId('count').textContent).toBe('2')
  const ids = screen.getByTestId('layout-ids').textContent?.split(',') ?? []
  expect(ids.filter((id) => id === 'a')).toHaveLength(1)
  expect(screen.getByTestId('edit-ids').textContent).toBe('a')
})

it('setInsightEdit stores and undoes edits', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /edit-a/i }))
  expect(screen.getByTestId('edit-ids').textContent).toBe('a')
  fireEvent.click(screen.getByRole('button', { name: /undo-a/i }))
  expect(screen.getByTestId('edit-ids').textContent).toBe('')
})

it('resetWorkspace clears everything', () => {
  renderProbe()
  fireEvent.click(screen.getByRole('button', { name: /apply/i }))
  fireEvent.click(screen.getByRole('button', { name: /reset/i }))
  expect(screen.getByTestId('locked').textContent).toBe('false')
  expect(screen.getByTestId('count').textContent).toBe('0')
  expect(screen.getByTestId('session').textContent).toBe('')
  expect(screen.getByTestId('layout-ids').textContent).toBe('')
  expect(screen.getByTestId('edit-ids').textContent).toBe('')
})

it('useWorkspace throws outside the provider', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const Outside = () => {
    useWorkspace()
    return null
  }
  expect(() => render(<Outside />)).toThrow(/WorkspaceProvider/i)
  consoleError.mockRestore()
})
