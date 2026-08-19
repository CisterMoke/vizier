import { useRef, useState } from 'preact/hooks'
import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ChartCarousel } from './components/ChartCarousel'
import { DataInputPanel } from './components/DataInputPanel'
import type { GenerateRequest } from './components/DataInputPanel'
import { downloadExportReport } from './lib/exportReport'
import { callGenerate, applyData } from './services/apiClient'
import { generateMockDataset } from './services/mockData'
import { buildDatasetFromRaw } from './services/dataIngest'
import { useWorkspaceStore } from './store/workspaceStore'

export function App() {
  const workspace = useWorkspaceStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [hasRealData, setHasRealData] = useState(false)
  const [isApplyingData, setIsApplyingData] = useState(false)
  const regenerateCounters = useRef<Record<string, number>>({})

  const handleGenerate = async (request: GenerateRequest) => {
    workspace.setRawSchema(request.schemaText)
    workspace.setInsights([])
    workspace.setDatasetSchema({ source: '', fields: [], warnings: [] })
    setGenerationError(null)
    setStatusMessage(null)
    setHasRealData(false)

    setIsGenerating(true)

    try {
      setStatusMessage('Analyzing data and generating insights...')
      const result = await callGenerate(request)

      workspace.setDatasetSchema(result.schema)

      const insights = result.insights
      workspace.setInsights(insights)

      if (result.realData && result.realData.rowCount > 0) {
        insights.forEach((insight) => {
          const dataset = buildDatasetFromRaw(insight.id, result.realData!)
          workspace.attachDataset(insight.id, dataset)
        })
        setHasRealData(true)
      } else {
        insights.forEach((insight, index) => {
          workspace.attachDataset(
            insight.id,
            generateMockDataset(result.schema, insight, { seed: workspace.demoSeed + index })
          )
        })
      }

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

  const handleApplyData = async (request: GenerateRequest) => {
    setGenerationError(null)
    setStatusMessage('Fetching real data...')
    setIsApplyingData(true)

    try {
      const realData = await applyData(request)

      if (realData && realData.rowCount > 0) {
        workspace.insights.forEach((insight) => {
          const dataset = buildDatasetFromRaw(insight.id, realData)
          workspace.attachDataset(insight.id, dataset)
        })
        setHasRealData(true)
        setStatusMessage(null)
      } else {
        setGenerationError('No data rows found in the response.')
      }
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'Failed to apply real data.'
      )
    } finally {
      setIsApplyingData(false)
      setStatusMessage(null)
    }
  }

  const handleRegenerateCard = (insightId: string) => {
    if (hasRealData) return

    const insight = workspace.insights.find((item) => item.id === insightId)
    const insightIndex = workspace.insights.findIndex((item) => item.id === insightId)

    if (!insight || insightIndex < 0) return

    regenerateCounters.current[insightId] = (regenerateCounters.current[insightId] ?? 0) + 1
    const regenCount = regenerateCounters.current[insightId]

    workspace.attachDataset(
      insightId,
      generateMockDataset(workspace.datasetSchema, insight, {
        seed: workspace.demoSeed + insightIndex + 1000 + regenCount * 7919
      })
    )
  }

  const handleDeleteCard = (insightId: string) => {
    workspace.removeInsight(insightId)
  }

  const handleExportReport = () => {
    const payload = workspace.exportReport()
    const stamp = new Date().toISOString().slice(0, 10)
    downloadExportReport(payload, `analytics-report-${stamp}.json`)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#0e2a47,_transparent_50%),radial-gradient(circle_at_bottom_right,_#1a1240,_transparent_50%),#0a0a0f] py-10">
      <Container size="xl">
        <Stack gap="lg">
          <Paper withBorder radius="xl" p="xl" className="bg-gray-900/60 backdrop-blur-md shadow-lg border-gray-700/50">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Badge variant="light" color="cyan" mb={8}>
                  Hackathon Mode
                </Badge>
                <Title order={1}>Analytics Idea Lab</Title>
                <Text c="dimmed" mt={6}>
                  Map any data source into a dataset schema, generate hypotheses, and visualize analytics instantly.
                </Text>
              </div>
              <Button
                type="button"
                onClick={handleExportReport}
                disabled={workspace.insights.length === 0}
                variant="filled"
              >
                Export report
              </Button>
            </Group>
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
            onApplyData={handleApplyData}
            isGenerating={isGenerating}
            isApplyingData={isApplyingData}
            hasInsights={workspace.insights.length > 0}
          />

          {hasRealData ? (
            <Text c="green" size="sm" fw={500}>
              Charts rendered with real data
            </Text>
          ) : null}

          <ChartCarousel
            insights={workspace.insights}
            datasetsByInsightId={workspace.datasetsByInsightId}
            onRegenerate={handleRegenerateCard}
            onDelete={handleDeleteCard}
          />
        </Stack>
      </Container>
    </div>
  )
}
