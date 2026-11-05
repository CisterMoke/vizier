import { useMemo } from 'react'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { ArrowsOutSimple } from '@phosphor-icons/react'
import { useWorkspace } from '../store/workspace'
import { GRID_COLS, MIN_H, MIN_W, sanitizeLayout, type LayoutItem } from '../domain/layout'
import { InsightCard } from './InsightCard'

const SizedGrid = WidthProvider(ReactGridLayout)

const ROW_HEIGHT = 80
const MARGIN: [number, number] = [10, 10]

/** Always-visible, in-theme resize affordance for the grid cells. Carries
 * the library class so react-grid-layout positions it and cancels card
 * drags started on it. A plain element, not a component: react-resizable
 * clones it with the ref its drag core binds to — a component would
 * swallow the ref and silently break resizing. */
const resizeHandle = (
  <span
    className="react-resizable-handle react-resizable-handle-se grid-resize-handle"
    data-testid="resize-handle"
  >
    <ArrowsOutSimple size={10} aria-hidden="true" />
  </span>
)

interface InsightGridProps {
  onEditOpen: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function InsightGrid({ onEditOpen, onDelete }: InsightGridProps) {
  const workspace = useWorkspace()

  const layout = useMemo(
    () =>
      sanitizeLayout(workspace.layout, workspace.insights.map((insight) => insight.id)).map(
        (item) => ({ ...item, minW: MIN_W, minH: MIN_H })
      ),
    [workspace.layout, workspace.insights]
  )

  return (
    <SizedGrid
      className="layout"
      cols={GRID_COLS}
      rowHeight={ROW_HEIGHT}
      margin={MARGIN}
      layout={layout}
      onLayoutChange={(next: readonly LayoutItem[]) => workspace.setLayout(next as LayoutItem[])}
      compactType="vertical"
      preventCollision={false}
      draggableHandle=".grid-drag-handle"
      resizeHandle={resizeHandle}
    >
      {workspace.insights.map((insight) => (
        <div key={insight.id} style={{ display: 'flex' }}>
          <InsightCard
            insight={insight}
            sessionId={workspace.sessionId}
            bundleContext={workspace.bundleContext}
            onEdit={() => onEditOpen(insight.id)}
            onDelete={() => onDelete(insight.id)}
          />
        </div>
      ))}
    </SizedGrid>
  )
}
