import { lazy, Suspense, useState } from 'react'
import { Alert, Container, Paper, Stack, Text, Title } from '@mantine/core'
import { ChartErrorBoundary } from './components/ChartErrorBoundary'
import { DataInputPanel } from './components/DataInputPanel'
import type { GenerateRequest } from './components/DataInputPanel'
import { callGenerate, regenerate, loadBundle } from './services/apiClient'
import type { CsvOptionsPayload } from './domain/csv'
import { buildConstraintsPayload, EMPTY_CONSTRAINTS, type ConstraintsState } from './domain/constraints'
import { useWorkspaceStore } from './store/workspaceStore'

const ChartCarousel = lazy(() =>
  import('./components/ChartCarousel').then((m) => ({ default: m.ChartCarousel }))
)

export function App() {
  const workspace = useWorkspaceStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [hasRealData, setHasRealData] = useState(false)
  const [constraints, setConstraints] = useState<ConstraintsState>(EMPTY_CONSTRAINTS)

  const handleGenerate = async (request: GenerateRequest) => {
    workspace.setInsights([])
    workspace.setSessionId('')
    workspace.setCsvOptions(null)
    setGenerationError(null)
    setStatusMessage(null)
    setHasRealData(false)

    setIsGenerating(true)

    try {
      setStatusMessage('Analyzing data and generating insights...')
      const result = await callGenerate({ ...request, constraints: buildConstraintsPayload(constraints) })

      workspace.setSessionId(result.sessionId)
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
      workspace.setCsvOptions(result.csvOptions ?? null)
      setHasRealData(request.dataSource.mode !== 'none')
      setStatusMessage(null)
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to generate analytics.'
      )
    } finally {
      setIsGenerating(false)
      setStatusMessage(null)
    }
  }

  const handleRegenerate = async () => {
    if (!workspace.sessionId) return

    setGenerationError(null)
    setIsRegenerating(true)

    try {
      setStatusMessage('Regenerating insights...')
      const result = await regenerate(workspace.sessionId, buildConstraintsPayload(constraints))
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
      setStatusMessage(null)
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to regenerate insights.'
      )
    } finally {
      setIsRegenerating(false)
      setStatusMessage(null)
    }
  }

  const handleImportBundle = async (
    bundle: File,
    data?: File,
    dataFormat?: string,
    csvOptions?: CsvOptionsPayload
  ) => {
    setGenerationError(null)
    setStatusMessage('Loading saved bundle...')

    setIsImporting(true)

    try {
      const result = await loadBundle(bundle, data, dataFormat, csvOptions)

      workspace.setSessionId(result.sessionId)
      workspace.setInsights(result.insights)
      workspace.setBundleContext(result.context)
      workspace.setCsvOptions(result.csvOptions ?? null)
      setHasRealData(!!data)
      setStatusMessage(null)
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to load bundle.'
      )
    } finally {
      setIsImporting(false)
      setStatusMessage(null)
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

          {generationError ? (
            <Alert role="alert" color="orange">
              {generationError}
            </Alert>
          ) : null}

          {statusMessage ? (
            <Alert color="blue">
              {statusMessage}
            </Alert>
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
              />
            </Suspense>
          </ChartErrorBoundary>
        </Stack>
      </Container>
    </div>
  )
}
