import type { CanonicalSchema, InsightCandidate } from '../domain/types'

export interface InsightPromptInput {
  schema: CanonicalSchema
  maxIdeas: number
}

export interface LLMProvider {
  generateInsights(input: InsightPromptInput): Promise<InsightCandidate[]>
}

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const SYSTEM_PROMPT =
  'Generate insight candidates for analytics chart cards. Return strict JSON with an insights array containing id, title, summary, confidence (0-1), hypothesis, metricDescription, chartRecommendation, and assumptions.'

const extractResponseText = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null
  }

  if (typeof payload.output_text === 'string') {
    return payload.output_text
  }

  if (!Array.isArray(payload.output)) {
    return null
  }

  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue
    }

    for (const contentItem of item.content) {
      if (isRecord(contentItem) && typeof contentItem.text === 'string') {
        return contentItem.text
      }
    }
  }

  return null
}

const extractItems = (payload: unknown): InsightCandidate[] => {
  if (Array.isArray(payload)) {
    return payload as InsightCandidate[]
  }

  if (isRecord(payload) && Array.isArray(payload.insights)) {
    return payload.insights as InsightCandidate[]
  }

  const responseText = extractResponseText(payload)

  if (responseText) {
    const parsed = JSON.parse(responseText) as unknown
    return extractItems(parsed)
  }

  throw new Error('Provider response did not include insight candidates')
}

export const createBrowserLLMProvider = (apiKey: string, endpoint = DEFAULT_ENDPOINT): LLMProvider => ({
  generateInsights: async (input: InsightPromptInput): Promise<InsightCandidate[]> => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        text: {
          format: {
            type: 'json_object'
          }
        },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: SYSTEM_PROMPT }]
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: JSON.stringify(input) }]
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`)
    }

    return extractItems(await response.json())
  }
})
