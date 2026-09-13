import { useState } from 'preact/hooks'
import { Alert, Badge, Container, Paper, Stack, Text, Title } from '@mantine/core'
import { ChartCarousel } from './components/ChartCarousel'
import { DataInputPanel } from './components/DataInputPanel'
import type { GenerateRequest } from './components/DataInputPanel'
import { callGenerate } from './services/apiClient'
import { useWorkspaceStore } from './store/workspaceStore'

export function App() {
  const workspace = useWorkspaceStore()
  const [isGenerating, setIsGenerating] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [hasRealData, setHasRealData] = useState(false)

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

      if (result.schema) {
        workspace.setDatasetSchema(result.schema)
      }

      workspace.setInsights(result.insights)
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

  const handleDeleteCard = (insightId: string) => {
    workspace.removeInsight(insightId)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#0e2a47,_transparent_50%),radial-gradient(circle_at_bottom_right,_#1a1240,_transparent_50%),#0a0a0f] py-10">
      <Container size="xl">
        <Stack gap="lg">
          <Paper withBorder radius="xl" p="xl" className="bg-gray-900/60 backdrop-blur-md shadow-lg border-gray-700/50">
            <Badge variant="light" color="cyan" mb={8}>
              Pixel Forge AI Hackathon
            </Badge>
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
          />

          {hasRealData ? (
            <Text c="green" size="sm" fw={500}>
              Charts rendered with real data
            </Text>
          ) : null}

          <ChartCarousel
            insights={workspace.insights}
            onDelete={handleDeleteCard}
          />
        </Stack>
      </Container>
    </div>
  )
}
