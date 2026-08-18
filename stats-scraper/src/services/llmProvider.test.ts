import { createLLMProvider } from './llmProvider'
import type { CanonicalSchema } from '../domain/types'

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: (opts: unknown) => opts }
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn((_opts: unknown) => (model: string) => ({ model, provider: 'google' }))
}))

vi.mock('@ai-sdk/mistral', () => ({
  createMistral: vi.fn((_opts: unknown) => (model: string) => ({ model, provider: 'mistral' }))
}))

import { generateText } from 'ai'

const schema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

beforeEach(() => {
  vi.mocked(generateText).mockReset()
})

it('uses google provider with structured output for schema mapping', async () => {
  vi.mocked(generateText).mockResolvedValue({
    output: {
      entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
      relationships: [],
      warnings: []
    }
  } as unknown as Awaited<ReturnType<typeof generateText>>)

  const llm = createLLMProvider({ apiKey: 'demo-key', provider: 'google', model: 'gemini-2.0-flash' })
  const canonical = await llm.mapCanonicalSchema('orders(id int)')

  expect(canonical.entities[0].name).toBe('orders')
  expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
})

it('uses mistral provider with structured output for insight generation', async () => {
  vi.mocked(generateText).mockResolvedValue({
    output: {
      insights: [
        {
          id: 'ins-1',
          title: 'Orders over time',
          summary: 'Order volume by week.',
          confidence: 0.8,
          hypothesis: 'Order volume has periodic patterns.',
          metricDescription: 'Weekly order count.',
          chartRecommendation: 'line',
          assumptions: ['Timestamps are accurate.']
        }
      ]
    }
  } as unknown as Awaited<ReturnType<typeof generateText>>)

  const llm = createLLMProvider({ apiKey: 'demo-key', provider: 'mistral', model: 'mistral-large-latest' })
  const insights = await llm.generateInsights({ schema, maxIdeas: 5 })

  expect(insights[0].id).toBe('ins-1')
  expect(insights[0].chartRecommendation).toBe('line')
  expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
})
