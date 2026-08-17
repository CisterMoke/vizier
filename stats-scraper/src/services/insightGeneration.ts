import type { InsightCandidate, CanonicalSchema } from '../domain/types'
import type { LLMProvider } from './llmProvider'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Expected string at ${path}`)
  }

  return value
}

const asNumber = (value: unknown, path: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected number at ${path}`)
  }

  return value
}

const parseInsightCandidate = (value: unknown, path: string): InsightCandidate => {
  if (!isRecord(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return {
    id: asString(value.id, `${path}.id`),
    title: asString(value.title, `${path}.title`),
    summary: asString(value.summary, `${path}.summary`),
    confidence: asNumber(value.confidence, `${path}.confidence`)
  }
}

const parseInsightCandidateArray = (value: unknown): InsightCandidate[] => {
  if (!Array.isArray(value)) {
    throw new Error('Expected insight candidate array')
  }

  return value.map((item, index) => parseInsightCandidate(item, `insights[${index}]`))
}

export const generateInsightCandidates = async (
  schema: CanonicalSchema,
  provider: LLMProvider
): Promise<InsightCandidate[]> => {
  const raw = await provider.generateInsights({ schema, maxIdeas: 10 })
  return parseInsightCandidateArray(raw)
}
