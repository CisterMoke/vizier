import type { InsightCandidate, CanonicalSchema } from '../domain/types'
import type { LLMProvider } from './llmProvider'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const CHART_RECOMMENDATIONS = new Set(['bar', 'line', 'pie', 'scatter', 'table'])

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

const asStringArray = (value: unknown, path: string): string[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${path}`)
  }

  return value.map((item, index) => asString(item, `${path}[${index}]`))
}

const asChartRecommendation = (
  value: unknown,
  path: string
): 'bar' | 'line' | 'pie' | 'scatter' | 'table' => {
  const parsed = asString(value, path)

  if (!CHART_RECOMMENDATIONS.has(parsed)) {
    throw new Error(`Expected chart recommendation at ${path}`)
  }

  return parsed as 'bar' | 'line' | 'pie' | 'scatter' | 'table'
}

const parseInsightCandidate = (value: unknown, path: string): InsightCandidate => {
  if (!isRecord(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return {
    id: asString(value.id, `${path}.id`),
    title: asString(value.title, `${path}.title`),
    summary: asString(value.summary, `${path}.summary`),
    confidence: asNumber(value.confidence, `${path}.confidence`),
    hypothesis: asString(value.hypothesis, `${path}.hypothesis`),
    metricDescription: asString(value.metricDescription, `${path}.metricDescription`),
    chartRecommendation: asChartRecommendation(value.chartRecommendation, `${path}.chartRecommendation`),
    assumptions: asStringArray(value.assumptions, `${path}.assumptions`)
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
