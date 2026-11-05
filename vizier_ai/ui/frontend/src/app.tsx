import { lazy, Suspense, useState } from 'react'
import { Button, Group, SegmentedControl, Text, VisuallyHidden } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import type { GenerateRequest } from './domain/types'
import { buildConstraintsPayload, EMPTY_CONSTRAINTS, type ConstraintsState } from './domain/constraints'
import { rebuildLayout } from './domain/layout'
import { WorkspaceProvider, useWorkspace, type RemovedInsight } from './store/workspace'
import { ControlPanel } from './components/ControlPanel'
import { EmptyState } from './components/EmptyState'
import { GenerationProgress, type GenerationPhase } from './components/GenerationProgress'
import { ViewRail, type ViewItem } from './components/ViewRail'
import { callGenerate, regenerate, type GenerationEvent } from './services/apiClient'

const InsightGrid = lazy(() =>
  import('./components/InsightGrid').then((m) => ({ default: m.InsightGrid }))
)
const InsightEditorModal = lazy(() =>
  import('./components/InsightEditorModal').then((m) => ({ default: m.InsightEditorModal }))
)

interface GenerationProgressState {
  phase: GenerationPhase
  label: string
  chartIndex?: number
  chartTotal?: number
  uploadFraction?: number
}

/** Pipeline events map to progress phases; the component creeps smoothly
 * toward the next checkpoint between them. The two LLM calls (schema
 * extraction, insight generation) are the long phases. */
const progressForEvent = (event: GenerationEvent): GenerationProgressState => {
  switch (event.type) {
    case 'upload':
      return {
        phase: 'upload',
        label: `Uploading data… ${Math.round(event.fraction * 100)}%`,
        uploadFraction: event.fraction,
      }
    case 'prepare':
      return {
        phase: 'schema',
        label: event.rowCount > 0
          ? `Parsed ${event.rowCount.toLocaleString()} rows — extracting schema…`
          : 'Extracting schema…',
      }
    case 'schema':
      return { phase: 'insights', label: 'Generating insights…' }
    case 'insights':
      return { phase: 'charts', label: `${event.count} insights — building charts…` }
    case 'chart':
      return {
        phase: 'charts',
        label: `Building chart ${event.index + 1} of ${event.total}`,
        chartIndex: event.index,
        chartTotal: event.total,
      }
  }
}

const showError = (title: string, message: string) => {
  notifications.show({
    color: 'red',
    title,
    message,
    autoClose: 8000,
  })
}

const strokeIconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** Studio: a 2x2 insight mosaic. */
const StudioIcon = () => (
  <svg {...strokeIconProps} aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
)

/** Column-count glyphs for the mosaic switcher. */
const ColumnGlyph = ({ columns }: { columns: number }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    {Array.from({ length: columns }).map((_, index) => (
      <rect
        key={index}
        x={1 + index * (14 / columns)}
        y={2}
        width={14 / columns - 1}
        height={12}
        rx={1}
      />
    ))}
  </svg>
)

/** Dashboard: panels view for a future report page. */
const DashboardIcon = () => (
  <svg {...strokeIconProps} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 9v11" />
  </svg>
)

const VIEWS: ViewItem[] = [
  { id: 'studio', label: 'Studio', icon: <StudioIcon /> },
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon />, disabled: true },
]

function Studio() {
  const workspace = useWorkspace()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgressState | null>(null)
  const [hasRealData, setHasRealData] = useState(false)
  const [constraints, setConstraints] = useState<ConstraintsState>(EMPTY_CONSTRAINTS)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [columns, setColumns] = useState(2)

  const handleGenerate = async (request: GenerateRequest) => {
    // file runs wait for real upload progress: no optimistic creeping
    // ahead of the bytes. Text-mode requests leave instantly, so their
    // upload band is earned from the start.
    const isFileUpload = request.dataSource.mode === 'file' && Boolean(request.dataSource.file)
    setProgress(
      isFileUpload
        ? { phase: 'upload', label: 'Uploading data… 0%', uploadFraction: 0 }
        : { phase: 'prepare', label: 'Preparing data…' }
    )
    setHasRealData(false)
    setIsGenerating(true)
    try {
      const result = await callGenerate(
        { ...request, constraints: buildConstraintsPayload(constraints) },
        (event) => setProgress(progressForEvent(event))
      )
      workspace.applyGeneration(result)
      setHasRealData(request.dataSource.mode !== 'none')
      setProgress({ phase: 'done', label: 'Done' })
    } catch (error) {
      setProgress(null)
      showError(
        'Generation failed',
        error instanceof Error ? error.message : 'Failed to generate analytics.'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    if (!workspace.sessionId) return
    setProgress({ phase: 'prepare', label: 'Regenerating insights…' })
    setIsRegenerating(true)
    try {
      const result = await regenerate(
        workspace.sessionId,
        buildConstraintsPayload(constraints),
        (event) => setProgress(progressForEvent(event))
      )
      workspace.appendInsights(result.insights, result.context)
      setProgress({ phase: 'done', label: 'Done' })
    } catch (error) {
      setProgress(null)
      showError(
        'Regeneration failed',
        error instanceof Error ? error.message : 'Failed to regenerate insights.'
      )
    } finally {
      setIsRegenerating(false)
    }
  }

  const changeColumns = (next: number) => {
    setColumns(next)
    if (workspace.insights.length > 0) {
      workspace.setLayout(rebuildLayout(workspace.layout, next))
    }
  }

  const handleDelete = (insightId: string) => {
    const removed: RemovedInsight | null = workspace.removeInsight(insightId)
    if (!removed) return
    const toastId = notifications.show({
      message: (
        <Group gap="xs">
          <Text size="sm">Insight deleted</Text>
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => {
              workspace.restoreInsight(removed)
              notifications.hide(toastId)
            }}
          >
            Undo
          </Button>
        </Group>
      ),
      autoClose: 5000,
    })
  }

  const editing = workspace.insights.find((item) => item.id === editingId) ?? null
  const gridEmpty = workspace.insights.length === 0

  return (
    <div className="relative flex h-screen flex-col overflow-hidden md:flex-row bg-[radial-gradient(circle_at_top_left,#0e2a47,transparent_50%),radial-gradient(circle_at_bottom_right,#1a1240,transparent_50%),#0a0a0f]">
      <div className="hidden h-full md:block">
        <ViewRail views={VIEWS} activeView="studio" />
      </div>
      <aside className="w-full shrink-0 overflow-y-auto border-b border-gray-700/50 md:w-[340px] md:border-b-0 md:border-r md:border-gray-700/50">
        <ControlPanel
          isGenerating={isGenerating}
          isRegenerating={isRegenerating}
          hasRealData={hasRealData}
          constraints={constraints}
          onConstraintsChange={setConstraints}
          onGenerate={handleGenerate}
          onRegenerate={handleRegenerate}
        />
      </aside>
      <main className="flex-1 overflow-y-auto p-4">
        {gridEmpty ? (
          <EmptyState />
        ) : (
          <>
            <Group justify="end" mb="xs">
              <SegmentedControl
                size="xs"
                radius="md"
                aria-label="Grid columns"
                data={[
                  {
                    value: '1',
                    label: (
                      <>
                        <ColumnGlyph columns={1} />
                        <VisuallyHidden>One column</VisuallyHidden>
                      </>
                    ),
                  },
                  {
                    value: '2',
                    label: (
                      <>
                        <ColumnGlyph columns={2} />
                        <VisuallyHidden>Two columns</VisuallyHidden>
                      </>
                    ),
                  },
                  {
                    value: '3',
                    label: (
                      <>
                        <ColumnGlyph columns={3} />
                        <VisuallyHidden>Three columns</VisuallyHidden>
                      </>
                    ),
                  },
                ]}
                value={String(columns)}
                onChange={(value) => changeColumns(Number(value))}
              />
            </Group>
            <Suspense fallback={<Text c="dimmed" size="sm">Loading charts...</Text>}>
              <InsightGrid onEditOpen={setEditingId} onDelete={handleDelete} />
            </Suspense>
          </>
        )}
      </main>

      {progress ? (
        <GenerationProgress
          phase={progress.phase}
          label={progress.label}
          chartIndex={progress.chartIndex}
          chartTotal={progress.chartTotal}
          uploadFraction={progress.uploadFraction}
          onFinished={() => setProgress(null)}
        />
      ) : null}

      {editing ? (
        <Suspense fallback={null}>
          <InsightEditorModal
            insight={editing}
            schema={workspace.bundleContext?.schema ?? null}
            sessionId={workspace.sessionId}
            opened
            onClose={() => setEditingId(null)}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

export function App() {
  return (
    <WorkspaceProvider>
      <Studio />
    </WorkspaceProvider>
  )
}
