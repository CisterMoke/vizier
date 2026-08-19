import { Alert, Badge, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useState } from 'preact/hooks'
import { ChartGrid } from './components/ChartGrid'
import { InsightControls } from './components/InsightControls'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { SchemaPreviewEditor } from './components/SchemaPreviewEditor'
import { FALLBACK_INSIGHTS, SAMPLE_SCHEMAS } from './data/sampleSchemas'
import { downloadExportReport } from './lib/exportReport'
import { generateInsightCandidates } from './services/insightGeneration'
import { createLLMProvider } from './services/llmProvider'
import type { ProviderId } from './services/llmProvider'
import { generateMockDataset } from './services/mockData'
import { useWorkspaceStore } from './store/workspaceStore'

const API_KEY_REQUIRED_MESSAGE = 'Provide an API key to run AI schema mapping.'

const envApiKey = (import.meta.env.VITE_LLM_API_KEY as string) || ''
const envProvider = ((import.meta.env.VITE_LLM_PROVIDER as string) || 'google') as ProviderId
const envModel = (import.meta.env.VITE_LLM_MODEL as string) || (envProvider === 'google' ? 'gemini-2.0-flash' : 'mistral-large-latest')

export function App() {
  const workspace = useWorkspaceStore()
  const [apiKey, setApiKey] = useState(envApiKey)
  const [provider, setProvider] = useState<ProviderId>(envProvider)
  const [model, setModel] = useState(envModel)
  const [isMapping, setIsMapping] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  const buildFallbackDatasets = (fallbackInsights = FALLBACK_INSIGHTS) => {
    fallbackInsights.forEach((insight, index) => {
      workspace.attachDataset(
        insight.id,
        generateMockDataset(workspace.datasetSchema, insight, { seed: workspace.demoSeed + index })
      )
    })
  }

  const handleMapSchema = async (rawText: string) => {
    workspace.setRawSchema(rawText)
    workspace.setInsights([])
    setGenerationError(null)

    if (apiKey.trim().length === 0) {
      setGenerationError(API_KEY_REQUIRED_MESSAGE)
      return
    }

    setIsMapping(true)

    try {
      const llm = createLLMProvider({ apiKey, provider, model })
      const schema = await llm.mapSchema(rawText)
      workspace.setDatasetSchema(schema)
    } catch (error) {
      setGenerationError(
        error instanceof Error ? `Schema mapping failed: ${error.message}` : 'Schema mapping failed.'
      )
    } finally {
      setIsMapping(false)
    }
  }

  const handleGenerateInsights = async () => {
    if (workspace.datasetSchema.fields.length === 0) {
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      if (apiKey.trim().length === 0) {
        workspace.setInsights(FALLBACK_INSIGHTS)
        buildFallbackDatasets()
        setGenerationError('No API key provided. Loaded offline fallback insights.')
        return
      }

      const llm = createLLMProvider({ apiKey, provider, model })
      const nextInsights = await generateInsightCandidates(workspace.datasetSchema, llm)

      workspace.setInsights(nextInsights)
      nextInsights.forEach((insight, index) => {
        workspace.attachDataset(
          insight.id,
          generateMockDataset(workspace.datasetSchema, insight, { seed: workspace.demoSeed + index })
        )
      })
    } catch (error) {
      workspace.setInsights(FALLBACK_INSIGHTS)
      buildFallbackDatasets()
      setGenerationError(
        error instanceof Error
          ? `${error.message}. Loaded offline fallback insights.`
          : 'Failed to generate insights. Loaded offline fallback insights.'
      )
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateCard = (insightId: string) => {
    const insight = workspace.insights.find((item) => item.id === insightId)
    const insightIndex = workspace.insights.findIndex((item) => item.id === insightId)

    if (!insight || insightIndex < 0) {
      return
    }

    workspace.attachDataset(
      insightId,
      generateMockDataset(workspace.datasetSchema, insight, { seed: workspace.demoSeed + insightIndex + 1000 })
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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_45%),radial-gradient(circle_at_bottom_right,_#fef3c7,_transparent_45%),#f8fafc] py-10">
      <Container size="xl">
        <Stack gap="lg">
          <Paper withBorder radius="xl" p="xl" className="bg-white/85 backdrop-blur-md shadow-md">
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

          {generationError ? (
            <Alert role="alert" color="orange">
              {generationError}
            </Alert>
          ) : null}

          <SchemaInputPanel onMapSchema={handleMapSchema} isMapping={isMapping} sampleSchemas={SAMPLE_SCHEMAS} />

          <SchemaPreviewEditor schema={workspace.datasetSchema} onChange={workspace.setDatasetSchema} />

          <InsightControls
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            provider={provider}
            onProviderChange={setProvider}
            model={model}
            onModelChange={setModel}
            onGenerate={handleGenerateInsights}
            isGenerating={isGenerating}
            disabled={workspace.datasetSchema.fields.length === 0}
          />

          <ChartGrid
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
