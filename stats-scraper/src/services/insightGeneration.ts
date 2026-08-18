import { parseInsightEnvelope } from '../domain/schemas'
import type { CanonicalSchema, InsightCandidate } from '../domain/types'
import type { LLMProvider } from './llmProvider'

export const generateInsightCandidates = async (
  schema: CanonicalSchema,
  provider: LLMProvider
): Promise<InsightCandidate[]> => {
  const raw = await provider.generateInsights({ schema, maxIdeas: 10 })
  return parseInsightEnvelope({ insights: raw }).insights
}
