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

const extractItems = (payload: unknown): InsightCandidate[] => {
  if (Array.isArray(payload)) {
    return payload as InsightCandidate[]
  }

  if (isRecord(payload) && Array.isArray(payload.insights)) {
    return payload.insights as InsightCandidate[]
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
      body: JSON.stringify(input)
    })

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`)
    }

    return extractItems(await response.json())
  }
})
