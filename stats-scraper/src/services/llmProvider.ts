import { createLLM } from '@node-llm/core'
import { canonicalSchemaSchema, insightEnvelopeSchema, parseCanonicalSchema, parseInsightEnvelope } from '../domain/schemas'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'

export interface InsightPromptInput {
  schema: CanonicalSchema
  maxIdeas: number
}

export interface LLMProvider {
  mapCanonicalSchema: (rawText: string) => Promise<CanonicalSchema>
  generateInsights: (input: InsightPromptInput) => Promise<InsightCandidate[]>
}

const MAP_SCHEMA_PROMPT =
  'Map free-text schema descriptions into canonical JSON with entities, fields, relationships, and warnings. Only include relationships with explicit evidence from the text.'

const INSIGHT_PROMPT =
  'Generate analytics hypotheses from the canonical schema. Return practical hackathon-ready ideas with concise reasoning and chart recommendations.'

const getDataFromResponse = (response: unknown): unknown => {
  if (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    (response as { data?: unknown }).data !== undefined
  ) {
    return (response as { data: unknown }).data
  }

  return response
}

export const createBrowserLLMProvider = (apiKey: string): LLMProvider => {
  const llm = createLLM({
    provider: 'openai',
    openaiApiKey: apiKey
  })

  return {
    mapCanonicalSchema: async (rawText: string): Promise<CanonicalSchema> => {
      const response = await llm
        .chat('gpt-5.4-nano')
        .withSchema(canonicalSchemaSchema as unknown as Record<string, unknown>)
        .withInstructions(MAP_SCHEMA_PROMPT)
        .ask(`Normalize this schema description into canonical JSON:\n\n${rawText}`)

      return parseCanonicalSchema(getDataFromResponse(response))
    },
    generateInsights: async (input: InsightPromptInput): Promise<InsightCandidate[]> => {
      const response = await llm
        .chat('gpt-5.4-nano')
        .withSchema(insightEnvelopeSchema as unknown as Record<string, unknown>)
        .withInstructions(INSIGHT_PROMPT)
        .ask(
          `Given this canonical schema, produce up to ${input.maxIdeas} insight candidates:\n\n${JSON.stringify(
            input.schema
          )}`
        )

      return parseInsightEnvelope(getDataFromResponse(response)).insights
    }
  }
}
