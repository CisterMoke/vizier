import { lazy, Suspense, useState } from 'react'
import { Container, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { ChartErrorBoundary } from './components/ChartErrorBoundary'
import { DataInputPanel } from './components/DataInputPanel'
import type { GenerateRequest } from './components/DataInputPanel'
import { GenerationProgress, type GenerationPhase } from './components/GenerationProgress'
import { callGenerate, regenerate, loadBundle, type GenerationEvent } from './services/apiClient'
import type { CsvOptionsPayload } from './domain/csv'
import type { ExcelOptionsPayload } from './domain/excel'
import { buildConstraintsPayload, EMPTY_CONSTRAINTS, type ConstraintsState } from './domain/constraints'
import { useWorkspaceStore } from './store/workspaceStore'

const ChartCarousel = lazy(() =>
  import('./components/ChartCarousel').then((m) => ({ default: m.ChartCarousel }))
)

interface GenerationProgressState {
  phase: GenerationPhase
  label: string
  chartIndex?: number
  chartTotal?: number
}

/** Pipeline events map to progress phases; the component creeps smoothly
 * toward the next checkpoint between them. The two LLM calls (schema
 * extraction, insight generation) are the long phases. */
const progressForEvent = (event: GenerationEvent): GenerationProgressState => {
  switch (event.type) {
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

export function App() {
  const workspace = useWorkspaceStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<GenerationProgressState | null>(null)
  const [hasRealData, setHasRealData] = useState(false)
  const [constraints, setConstraints] = useState<ConstraintsState>(EMPTY_CONSTRAINTS)

  const handleGenerate = async (request: GenerateRequest) => {
    workspace.setInsights([])
    workspace.setSessionId('')
    workspace.setCsvOptions(null)
    setProgress({ phase: 'prepare', label: 'Preparing data…' })
    setHasRealData(false)

    setIsGenerating(true)

    try {
      const result = await callGenerate(
        { ...request, constraints: buildConstraintsPayload(constraints) },
        (event) => setProgress(progressForEvent(event))
      )

      workspace.setSessionId(result.sessionId)
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
      workspace.setCsvOptions(result.csvOptions ?? null)
      workspace.setExcelOptions(result.excelOptions ?? null)
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
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
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

  const handleImportBundle = async (
    bundle: File,
    data?: File,
    dataFormat?: string,
    csvOptions?: CsvOptionsPayload,
    excelOptions?: ExcelOptionsPayload
  ) => {
    setIsImporting(true)

    try {
      const result = await loadBundle(bundle, data, dataFormat, csvOptions, excelOptions)

      workspace.setSessionId(result.sessionId)
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
      workspace.setCsvOptions(result.csvOptions ?? null)
      workspace.setExcelOptions(result.excelOptions ?? null)
      setHasRealData(!!data)
    } catch (error) {
      showError(
        'Bundle import failed',
        error instanceof Error ? error.message : 'Failed to load bundle.'
      )
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteCard = (insightId: string) => {
    workspace.removeInsight(insightId)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0e2a47,transparent_50%),radial-gradient(circle_at_bottom_right,#1a1240,transparent_50%),#0a0a0f] py-10">
      <Container size="xl">
        <Stack gap="lg">
          <Paper withBorder radius="xl" p="xl" className="bg-gray-900/60 backdrop-blur-md shadow-lg border-gray-700/50">
            <Title order={1}>Vizier AI</Title>
            <Text c="dimmed" mt={6}>
              Map any data source into a dataset schema, generate hypotheses, and visualize analytics instantly.
            </Text>
          </Paper>

          {progress ? (
            <GenerationProgress
              phase={progress.phase}
              label={progress.label}
              chartIndex={progress.chartIndex}
              chartTotal={progress.chartTotal}
              onFinished={() => setProgress(null)}
            />
          ) : null}

          <DataInputPanel
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
            hasInsights={workspace.insights.length > 0}
            onImportBundle={handleImportBundle}
            isImporting={isImporting}
            constraints={constraints}
            onConstraintsChange={setConstraints}
            onRegenerate={handleRegenerate}
            isRegenerating={isRegenerating}
          />

          {hasRealData ? (
            <Text c="green" size="sm" fw={500}>
              Charts rendered with real data
            </Text>
          ) : null}

          <ChartErrorBoundary>
            <Suspense fallback={<Text c="dimmed" size="sm">Loading charts...</Text>}>
              <ChartCarousel
                insights={workspace.insights}
                sessionId={workspace.sessionId}
                onDelete={handleDeleteCard}
                schema={workspace.bundleContext?.schema ?? null}
              />
            </Suspense>
          </ChartErrorBoundary>
        </Stack>
      </Container>
    </div>
  )
}
