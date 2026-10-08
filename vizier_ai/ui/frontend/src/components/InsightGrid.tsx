import { useMemo } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { useWorkspace } from '../store/workspace'
import { GRID_COLS, MIN_H, MIN_W, sanitizeLayout, type LayoutItem } from '../domain/layout'
import { InsightCard } from './InsightCard'

const SizedGrid = WidthProvider(GridLayout)

const ROW_HEIGHT = 80
const MARGIN: [number, number] = [16, 16]

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
      onLayoutChange={(next) => workspace.setLayout(next as LayoutItem[])}
      compactType="vertical"
      preventCollision={false}
      draggableHandle=".grid-drag-handle"
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
