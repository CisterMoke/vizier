import { useState } from 'preact/hooks'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { SchemaPreviewEditor } from './components/SchemaPreviewEditor'
import { InsightControls } from './components/InsightControls'
import { normalizeSchema } from './services/schemaNormalize'
import { createBrowserLLMProvider } from './services/llmProvider'
import { generateInsightCandidates } from './services/insightGeneration'
import type { CanonicalSchema, InsightCandidate } from './domain/types'
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
      setInsights(nextInsights)
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate insights')
    } finally {
      setIsGenerating(false)
    }
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
    </main>
  )
}
