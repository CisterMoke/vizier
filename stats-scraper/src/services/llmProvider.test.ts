import { createBrowserLLMProvider } from './llmProvider'
import type { CanonicalSchema } from '../domain/types'

const withSchemaSpy = vi.fn()
const withInstructionsSpy = vi.fn()
const askSpy = vi.fn()
const chatSpy = vi.fn()
const createLLMSpy = vi.fn()

vi.mock('@node-llm/core', () => ({
  createLLM: (...args: unknown[]) => createLLMSpy(...args)
}))

const schema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

beforeEach(() => {
  withSchemaSpy.mockReset()
  withInstructionsSpy.mockReset()
  askSpy.mockReset()
  chatSpy.mockReset()
  createLLMSpy.mockReset()

  withSchemaSpy.mockReturnThis()
  withInstructionsSpy.mockReturnThis()
  askSpy.mockResolvedValue({ data: { insights: [] } })

  chatSpy.mockReturnValue({
    withSchema: withSchemaSpy,
    withInstructions: withInstructionsSpy,
    ask: askSpy
  })

  createLLMSpy.mockReturnValue({
    chat: chatSpy
  })
})

it('uses node-llm with schema constraints when generating insights', async () => {
  askSpy.mockResolvedValue({
    data: {
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
  })

  const provider = createBrowserLLMProvider('demo-key')
  const insights = await provider.generateInsights({ schema, maxIdeas: 5 })

  expect(createLLMSpy).toHaveBeenCalledWith(expect.objectContaining({ openaiApiKey: 'demo-key' }))
  expect(chatSpy).toHaveBeenCalled()
  expect(withSchemaSpy).toHaveBeenCalled()
  expect(withInstructionsSpy).toHaveBeenCalled()
  expect(insights[0].id).toBe('ins-1')
})

it('maps free text into canonical schema through node-llm schema output', async () => {
  askSpy.mockResolvedValue({
    data: {
      entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
      relationships: [],
      warnings: []
    }
  })

  const provider = createBrowserLLMProvider('demo-key')
  const canonical = await provider.mapCanonicalSchema('orders(id int)')

  expect(withSchemaSpy).toHaveBeenCalled()
  expect(canonical.entities[0].name).toBe('orders')
})
