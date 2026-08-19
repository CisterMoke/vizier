import { createLLMProvider } from './llmProvider'
import type { DatasetSchema } from '../domain/types'

vi.mock('ai', () => ({
  generateText: vi.fn(),
  Output: { object: (opts: unknown) => opts },
  NoObjectGeneratedError: class NoObjectGeneratedError extends Error {
    static isInstance(e: unknown) { return e instanceof NoObjectGeneratedError }
  }
}))

vi.mock('@ai-sdk/google', () => ({
  createGoogle: vi.fn((_opts: unknown) => (model: string) => ({ model, provider: 'google' }))
}))

vi.mock('@ai-sdk/mistral', () => ({
  createMistral: vi.fn((_opts: unknown) => (model: string) => ({ model, provider: 'mistral' }))
}))

import { generateText } from 'ai'

const schema: DatasetSchema = {
  source: 'SQL: orders table',
  fields: [{ name: 'id', type: 'number', nullable: false }],
  warnings: []
}

beforeEach(() => {
  vi.mocked(generateText).mockReset()
})

it('uses google provider with structured output for schema mapping', async () => {
  vi.mocked(generateText).mockResolvedValue({
    output: {
      source: 'SQL: orders table',
      fields: [{ name: 'id', type: 'number', nullable: false }],
      warnings: []
    }
  } as unknown as Awaited<ReturnType<typeof generateText>>)

  const llm = createLLMProvider({ apiKey: 'demo-key', provider: 'google', model: 'gemini-2.0-flash' })
  const result = await llm.mapSchema('orders(id int)')

  expect(result.fields[0].name).toBe('id')
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
          chartSpec: {
            mode: 'recipe',
            chartType: 'line',
            xAxis: 'week',
            yAxis: 'order_count'
          },
          dataProfile: {
            rowCount: 52,
            columns: [
              { name: 'week', generator: 'linear', start: 1, end: 52, step: 1 },
              { name: 'order_count', generator: 'normal', mean: 300, stddev: 80, min: 50, max: 600 }
            ]
          },
          assumptions: ['Timestamps are accurate.']
        }
      ]
    }
  } as unknown as Awaited<ReturnType<typeof generateText>>)

  const llm = createLLMProvider({ apiKey: 'demo-key', provider: 'mistral', model: 'mistral-large-latest' })
  const insights = await llm.generateInsights({ schema, maxIdeas: 5 })

  expect(insights[0].id).toBe('ins-1')
  expect(insights[0].chartSpec.mode).toBe('recipe')
  expect(insights[0].dataProfile.columns).toHaveLength(2)
  expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
})

it('maps fields from real data columns to chart axes', async () => {
  vi.mocked(generateText).mockResolvedValue({
    output: {
      mappings: [
        {
          insightId: 'ins-1',
          mappings: { xAxis: 'created_date', yAxis: 'order_total' }
        }
      ]
    }
  } as unknown as Awaited<ReturnType<typeof generateText>>)

  const llm = createLLMProvider({ apiKey: 'demo-key', provider: 'google', model: 'gemini-2.0-flash' })
  const result = await llm.mapFields(
    [{ id: 'ins-1', title: 'test', summary: 's', confidence: 0.9, hypothesis: 'h', metricDescription: 'm', chartSpec: { mode: 'recipe', chartType: 'line', xAxis: 'week', yAxis: 'revenue' }, dataProfile: { rowCount: 10, columns: [] }, assumptions: [] }],
    ['created_date', 'order_total', 'customer_name']
  )

  expect(result.mappings).toHaveLength(1)
  expect(result.mappings[0].mappings.xAxis).toBe('created_date')
  expect(result.mappings[0].mappings.yAxis).toBe('order_total')
  expect(vi.mocked(generateText)).toHaveBeenCalledTimes(1)
})
