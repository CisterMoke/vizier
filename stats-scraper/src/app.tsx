import { useState } from 'preact/hooks'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { SchemaPreviewEditor } from './components/SchemaPreviewEditor'
import { InsightControls } from './components/InsightControls'
import { ChartGrid } from './components/ChartGrid'
import { normalizeSchema } from './services/schemaNormalize'
import { createBrowserLLMProvider } from './services/llmProvider'
import { generateInsightCandidates } from './services/insightGeneration'
import { generateMockDataset } from './services/mockData'
import { FALLBACK_INSIGHTS, SAMPLE_SCHEMAS } from './data/sampleSchemas'
import { serializeExportReport } from './lib/exportReport'
import { useWorkspaceStore } from './store/workspaceStore'
import './app.css'

export function App() {
  const workspace = useWorkspaceStore()
  const [apiKey, setApiKey] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [reportJson, setReportJson] = useState('')

  const applyRawSchema = (rawText: string) => {
    workspace.setRawSchema(rawText)
    workspace.setCanonicalSchema(normalizeSchema(rawText))
  }

  const buildFallbackDatasets = (fallbackInsights = FALLBACK_INSIGHTS) => {
    fallbackInsights.forEach((insight, index) => {
      workspace.attachDataset(
        insight.id,
        generateMockDataset(workspace.canonicalSchema, insight, { seed: workspace.demoSeed + index })
      )
    })
  }

  const handleGenerateInsights = async () => {
    if (workspace.canonicalSchema.entities.length === 0) {
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

      const provider = createBrowserLLMProvider(apiKey)
      const nextInsights = await generateInsightCandidates(workspace.canonicalSchema, provider)

      workspace.setInsights(nextInsights)
      nextInsights.forEach((insight, index) => {
        workspace.attachDataset(
          insight.id,
          generateMockDataset(workspace.canonicalSchema, insight, { seed: workspace.demoSeed + index })
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
      generateMockDataset(workspace.canonicalSchema, insight, { seed: workspace.demoSeed + insightIndex + 1000 })
    )
  }

  const handleDeleteCard = (insightId: string) => {
    workspace.removeInsight(insightId)
  }

  const handleExportReport = () => {
    const payload = workspace.exportReport()
    setReportJson(serializeExportReport(payload))
  }

  return (
    <main>
      <h1>Schema Normalization Studio</h1>
      <p>Paste freeform schema text, normalize it, and repair JSON directly.</p>

      <SchemaInputPanel onNormalize={applyRawSchema} />
      <SchemaPreviewEditor schema={workspace.canonicalSchema} onChange={workspace.setCanonicalSchema} />
      <InsightControls
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onGenerate={handleGenerateInsights}
        isGenerating={isGenerating}
        disabled={workspace.canonicalSchema.entities.length === 0}
      />

      {generationError ? <p role="alert">{generationError}</p> : null}

      <section>
        <h2>Demo schema quick start</h2>
        <button type="button" onClick={() => applyRawSchema(SAMPLE_SCHEMAS[0].rawSchema)}>
          Load {SAMPLE_SCHEMAS[0].label}
        </button>
      </section>

      {workspace.canonicalSchema.warnings.length > 0 ? (
        <section>
          <h2>Warnings</h2>
          <ul>
            {workspace.canonicalSchema.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {workspace.canonicalSchema.entities.length > 0 ? (
        <section>
          <h2>Detected entities</h2>
          <ul>
            {workspace.canonicalSchema.entities.map((entity) => (
              <li key={entity.name}>{entity.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {workspace.insights.length > 0 ? (
        <section>
          <h2>Insight candidates</h2>
          <ul>
            {workspace.insights.map((insight) => (
              <li key={insight.id}>{insight.title}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>Export</h2>
        <button type="button" onClick={handleExportReport} disabled={workspace.insights.length === 0}>
          Export report
        </button>
        {reportJson ? <pre>{reportJson}</pre> : null}
      </section>

      <ChartGrid
        insights={workspace.insights}
        datasetsByInsightId={workspace.datasetsByInsightId}
        onRegenerate={handleRegenerateCard}
        onDelete={handleDeleteCard}
      />
    </main>
  )
}
