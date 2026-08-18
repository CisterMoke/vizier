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

const INSIGHT_PROMPT =
  'Generate analytics hypotheses from the canonical schema. Return practical hackathon-ready ideas with concise reasoning and chart recommendations.'

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
