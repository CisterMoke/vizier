import { generateText, Output } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { canonicalSchemaSchema, insightEnvelopeSchema, parseCanonicalSchema, parseInsightEnvelope } from '../domain/schemas'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

export type ProviderId = 'google' | 'mistral'

export interface InsightPromptInput {
  schema: CanonicalSchema
  maxIdeas: number
}

export interface LLMProviderConfig {
  apiKey: string
  provider: ProviderId
  model: string
}

export interface LLMProvider {
  mapCanonicalSchema: (rawText: string) => Promise<CanonicalSchema>
  generateInsights: (input: InsightPromptInput) => Promise<InsightCandidate[]>
}

const MAP_SCHEMA_PROMPT =
  'Map free-text schema descriptions into canonical JSON with entities, fields, relationships, and warnings. Only include relationships with explicit evidence from the text.'

const INSIGHT_PROMPT = `Generate analytics hypotheses from the canonical schema.
For each insight, provide:
- A chartSpec with mode "recipe" (preferred) specifying chartType (bar, line, pie, or scatter), xAxis and yAxis column names from the schema, and aggregation (sum, count, avg, or none).
- For advanced cases, you may use mode "custom" with raw plotlyData and plotlyLayout.
- A dataProfile specifying rowCount and column definitions. Each column must use one of these generators:
  - "category": provide categories array (e.g. ["Electronics", "Clothing", "Home"])
  - "normal": provide mean and stddev, optional min/max for clamping
  - "uniform": provide min and max
  - "linear": provide start, end, and step (use for time-like axes)
  - "constant": provide value
Column names in dataProfile should match the chartSpec axis columns so the chart can render correctly.
Return practical hackathon-ready ideas with concise reasoning.`

const createModel = (config: LLMProviderConfig) => {
  if (config.provider === 'google') {
    const provider = createGoogle({ apiKey: config.apiKey })
    return provider(config.model)
  }

  if (config.provider === 'mistral') {
    const provider = createMistral({ apiKey: config.apiKey })
    return provider(config.model)
  }

  throw new Error(`Unsupported provider: ${config.provider}`)
}

export const createLLMProvider = (config: LLMProviderConfig): LLMProvider => {
  return {
    mapCanonicalSchema: async (rawText: string): Promise<CanonicalSchema> => {
      const model = createModel(config)
      const { output } = await generateText({
        model,
        output: Output.object({ schema: canonicalSchemaSchema }),
        system: MAP_SCHEMA_PROMPT,
        prompt: `Normalize this schema description into canonical JSON:\n\n${rawText}`
      })

      return parseCanonicalSchema(output)
    },
    generateInsights: async (input: InsightPromptInput): Promise<InsightCandidate[]> => {
      const model = createModel(config)
      const { output } = await generateText({
        model,
        output: Output.object({ schema: insightEnvelopeSchema }),
        system: INSIGHT_PROMPT,
        prompt: `Given this canonical schema, produce up to ${input.maxIdeas} insight candidates:\n\n${JSON.stringify(input.schema)}`
      })

      return parseInsightEnvelope(output).insights
    }
  }
}
