import { createBrowserLLMProvider } from './llmProvider'
import type { CanonicalSchema } from '../domain/types'

const schema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

it('sends an OpenAI responses-style request and parses output_text payload', async () => {
  const responsePayload = {
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({
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
            })
          }
        ]
      }
    ]
  }

  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  )

  const provider = createBrowserLLMProvider('demo-key')
  const insights = await provider.generateInsights({ schema, maxIdeas: 5 })

  const call = fetchSpy.mock.calls[0]
  const requestBody = JSON.parse(String((call[1] as RequestInit).body))

  expect(call[0]).toBe('https://api.openai.com/v1/responses')
  expect(requestBody).toMatchObject({
    model: 'gpt-4.1-mini',
    text: { format: { type: 'json_object' } }
  })
  expect(insights[0].id).toBe('ins-1')

  fetchSpy.mockRestore()
})

it('retains compatibility with direct insights payload fallback', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        insights: [
          {
            id: 'ins-2',
            title: 'Revenue mix',
            summary: 'Compare revenue share by segment.',
            confidence: 0.77,
            hypothesis: 'One segment dominates revenue.',
            metricDescription: 'Share of total revenue by segment.',
            chartRecommendation: 'pie',
            assumptions: ['Segment labels are complete.']
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  )

  const provider = createBrowserLLMProvider('demo-key')
  const insights = await provider.generateInsights({ schema, maxIdeas: 5 })

  expect(insights).toHaveLength(1)
  expect(insights[0].chartRecommendation).toBe('pie')

  fetchSpy.mockRestore()
})
