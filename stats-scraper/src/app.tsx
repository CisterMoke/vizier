import { useRef, useState } from 'preact/hooks'
import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ChartCarousel } from './components/ChartCarousel'
import { InsightControls } from './components/InsightControls'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { downloadExportReport } from './lib/exportReport'
import { generateInsightCandidates } from './services/insightGeneration'
import { createLLMProvider } from './services/llmProvider'
import type { ProviderId } from './services/llmProvider'
import { generateMockDataset } from './services/mockData'
import { useWorkspaceStore } from './store/workspaceStore'

const API_KEY_REQUIRED_MESSAGE = 'Provide an API key to generate analytics.'

const envApiKey = (import.meta.env.VITE_LLM_API_KEY as string) || ''
const envProvider = ((import.meta.env.VITE_LLM_PROVIDER as string) || 'google') as ProviderId
const envModel = (import.meta.env.VITE_LLM_MODEL as string) || (envProvider === 'google' ? 'gemini-2.0-flash' : 'mistral-large-latest')

export function App() {
  const workspace = useWorkspaceStore()
  const [apiKey, setApiKey] = useState(envApiKey)
  const [provider, setProvider] = useState<ProviderId>(envProvider)
  const [model, setModel] = useState(envModel)
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const regenerateCounters = useRef<Record<string, number>>({})

  const handleGenerate = async (rawText: string) => {
    workspace.setRawSchema(rawText)
    workspace.setInsights([])
    workspace.setDatasetSchema({ source: '', fields: [], warnings: [] })
    setGenerationError(null)
    setStatusMessage(null)

    if (apiKey.trim().length === 0) {
      setGenerationError(API_KEY_REQUIRED_MESSAGE)
      return
    }

    setIsGenerating(true)

    try {
      const llm = createLLMProvider({ apiKey, provider, model })

      setStatusMessage('Mapping data schema...')
      const schema = await llm.mapSchema(rawText)
      workspace.setDatasetSchema(schema)

      setStatusMessage('Generating analytics insights...')
      const nextInsights = await generateInsightCandidates(schema, llm)

      workspace.setInsights(nextInsights)
      nextInsights.forEach((insight, index) => {
        workspace.attachDataset(
          insight.id,
          generateMockDataset(schema, insight, { seed: workspace.demoSeed + index })
        )
      })

      setStatusMessage(null)
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? `${error.message}`
          : 'Failed to generate analytics.'
      )
    } finally {
      setIsGenerating(false)
      setStatusMessage(null)
    }
  }

  const handleRegenerateCard = (insightId: string) => {
    const insight = workspace.insights.find((item) => item.id === insightId)
    const insightIndex = workspace.insights.findIndex((item) => item.id === insightId)

    if (!insight || insightIndex < 0) {
      return
    }

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
                  Map any data source into a dataset schema, generate hypotheses, and visualize mock analytics instantly.
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

          <InsightControls
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            provider={provider}
            onProviderChange={setProvider}
            model={model}
            onModelChange={setModel}
          />

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

          <SchemaInputPanel onGenerate={handleGenerate} isGenerating={isGenerating} />

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
