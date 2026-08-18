import { parseInsightEnvelope } from '../domain/schemas'
import type { DatasetSchema, InsightCandidate } from '../domain/types'
import type { LLMProvider } from './llmProvider'

export const generateInsightCandidates = async (
  schema: DatasetSchema,
  provider: LLMProvider
): Promise<InsightCandidate[]> => {
  const raw = await provider.generateInsights({ schema, maxIdeas: 10 })
  return parseInsightEnvelope({ insights: raw }).insights
}
