import { useState } from 'preact/hooks'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { SchemaPreviewEditor } from './components/SchemaPreviewEditor'
import { InsightControls } from './components/InsightControls'
import { ChartGrid } from './components/ChartGrid'
import { normalizeSchema } from './services/schemaNormalize'
import { createBrowserLLMProvider } from './services/llmProvider'
import { generateInsightCandidates } from './services/insightGeneration'
import { generateMockDataset } from './services/mockData'
import type { CanonicalSchema, GeneratedDataset, InsightCandidate } from './domain/types'
import './app.css'

const EMPTY_SCHEMA: CanonicalSchema = {
  entities: [],
  relationships: [],
  warnings: []
}

export function App() {
  const [schema, setSchema] = useState<CanonicalSchema>(EMPTY_SCHEMA)
  const [apiKey, setApiKey] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [insights, setInsights] = useState<InsightCandidate[]>([])
  const [datasetsByInsightId, setDatasetsByInsightId] = useState<Record<string, GeneratedDataset>>({})
  const [generationError, setGenerationError] = useState<string | null>(null)

  const handleGenerateInsights = async () => {
    if (apiKey.trim().length === 0) {
      return
    }

    setIsGenerating(true)
    setGenerationError(null)

    try {
      const provider = createBrowserLLMProvider(apiKey)
      const nextInsights = await generateInsightCandidates(schema, provider)
      const nextDatasets = nextInsights.reduce<Record<string, GeneratedDataset>>((acc, insight, index) => {
        acc[insight.id] = generateMockDataset(schema, insight, { seed: 1337 + index })
        return acc
      }, {})

      setInsights(nextInsights)
      setDatasetsByInsightId(nextDatasets)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate insights')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRegenerateCard = (insightId: string) => {
    const insight = insights.find((item) => item.id === insightId)

    if (!insight) {
      return
    }

    setDatasetsByInsightId((current) => ({
      ...current,
      [insightId]: generateMockDataset(schema, insight, { seed: Date.now() })
    }))
  }

  const handleDeleteCard = (insightId: string) => {
    setInsights((current) => current.filter((insight) => insight.id !== insightId))
    setDatasetsByInsightId((current) => {
      const next = { ...current }
      delete next[insightId]
      return next
    })
  }

  return (
    <main>
      <h1>Schema Normalization Studio</h1>
      <p>Paste freeform schema text, normalize it, and repair JSON directly.</p>

      <SchemaInputPanel onNormalize={(rawText) => setSchema(normalizeSchema(rawText))} />
      <SchemaPreviewEditor schema={schema} onChange={setSchema} />
      <InsightControls
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onGenerate={handleGenerateInsights}
        isGenerating={isGenerating}
        disabled={schema.entities.length === 0}
      />

      {generationError ? <p role="alert">{generationError}</p> : null}

      {schema.warnings.length > 0 ? (
        <section>
          <h2>Warnings</h2>
          <ul>
            {schema.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {schema.entities.length > 0 ? (
        <section>
          <h2>Detected entities</h2>
          <ul>
            {schema.entities.map((entity) => (
              <li key={entity.name}>{entity.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {insights.length > 0 ? (
        <section>
          <h2>Insight candidates</h2>
          <ul>
            {insights.map((insight) => (
              <li key={insight.id}>{insight.title}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ChartGrid
        insights={insights}
        datasetsByInsightId={datasetsByInsightId}
        onRegenerate={handleRegenerateCard}
        onDelete={handleDeleteCard}
      />
    </main>
  )
}
