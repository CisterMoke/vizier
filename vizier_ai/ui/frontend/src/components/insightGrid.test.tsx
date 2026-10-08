import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { WorkspaceProvider, useWorkspace } from '../store/workspace'
import type { InsightCandidate } from '../domain/types'
import { InsightGrid } from './InsightGrid'

const mockState = vi.hoisted(() => ({
  emitLayout: [] as Array<{ i: string; x: number; y: number; w: number; h: number }>,
}))

vi.mock('react-grid-layout', () => ({
  default: () => null,
  WidthProvider: (Wrapped: unknown) => {
    const Grid = (props: Record<string, unknown>) => (
      <div>
        <div data-testid="grid-layout" data-layout={JSON.stringify(props.layout ?? [])}>
          {props.children as never}
        </div>
        <button
          data-testid="emit-layout"
          onClick={() => (props.onLayoutChange as (layout: unknown) => void)?.(mockState.emitLayout)}
        />
      </div>
    )
    return Grid
  },
}))

vi.mock('./InsightCard', () => ({
  InsightCard: ({
    insight,
    onEdit,
    onDelete,
  }: {
    insight: InsightCandidate
    onEdit: () => void
    onDelete: () => void
  }) => (
    <div data-testid="insight-card-mock" data-insight-id={insight.id}>
      <button onClick={onEdit}>edit {insight.id}</button>
      <button onClick={onDelete}>delete {insight.id}</button>
    </div>
  ),
}))

const insight = (id: string): InsightCandidate => ({
  id,
  metadata: { title: `T ${id}`, summary: 'S', description: null },
  chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} },
})

const Harness = ({
  insights,
  onEditOpen,
  onDelete,
}: {
  insights: InsightCandidate[]
  onEditOpen: (id: string) => void
  onDelete: (id: string) => void
}) => {
  const ws = useWorkspace()
  return (
    <>
      <button
        data-testid="hydrate"
        onClick={() => ws.applyGeneration({ sessionId: 's1', insights, context: null })}
      >
        hydrate
      </button>
      <InsightGrid onEditOpen={onEditOpen} onDelete={onDelete} />
    </>
  )
}

const renderGrid = (insights: InsightCandidate[], onEditOpen = vi.fn(), onDelete = vi.fn()) =>
  render(
    <MantineProvider>
      <WorkspaceProvider>
        <Harness insights={insights} onEditOpen={onEditOpen} onDelete={onDelete} />
      </WorkspaceProvider>
    </MantineProvider>
  )

it('renders one card per insight in order', () => {
  renderGrid([insight('a'), insight('b')])
  fireEvent.click(screen.getByTestId('hydrate'))
  expect(screen.getAllByTestId('insight-card-mock')).toHaveLength(2)
  expect(screen.getAllByTestId('insight-card-mock').map((el) => el.dataset.insightId)).toEqual(['a', 'b'])
})

it('emits layout items for every insight with default footprints', () => {
  renderGrid([insight('a')])
  fireEvent.click(screen.getByTestId('hydrate'))
  const layout = JSON.parse(screen.getByTestId('grid-layout').dataset.layout ?? '[]')
  expect(layout).toEqual([{ i: 'a', x: 0, y: 0, w: 4, h: 4, minW: 2, minH: 2 }])
})

it('syncs layout changes from the grid into the workspace', () => {
  renderGrid([insight('a')])
  fireEvent.click(screen.getByTestId('hydrate'))
  mockState.emitLayout = [{ i: 'a', x: 4, y: 0, w: 4, h: 4 }]
  fireEvent.click(screen.getByTestId('emit-layout'))
  const layout = JSON.parse(screen.getByTestId('grid-layout').dataset.layout ?? '[]')
  expect(layout[0]).toMatchObject({ i: 'a', x: 4 })
})

it('forwards edit and delete callbacks per card', () => {
  const onEditOpen = vi.fn()
  const onDelete = vi.fn()
  renderGrid([insight('a')], onEditOpen, onDelete)
  fireEvent.click(screen.getByTestId('hydrate'))
  fireEvent.click(screen.getByRole('button', { name: /edit a/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete a/i }))
  expect(onEditOpen).toHaveBeenCalledWith('a')
  expect(onDelete).toHaveBeenCalledWith('a')
})
