import { parseInsights } from './schemas'

it('parses an insight with metadata and chart_spec', () => {
  const parsed = parseInsights({
    insights: [
      {
        id: 'ins-1',
        metadata: {
          title: 'EV Count by County',
          summary: 'Bar chart showing EV count',
          keyIdea: 'Urban counties have more EVs',
        },
        chart_spec: {
          traces: [],
          plotlyData: [{ type: 'bar', x: ['King', 'Pierce'], y: [500, 200] }],
          plotlyLayout: { title: { text: 'EV Count' } }
        }
      }
    ]
  })

  expect(parsed.insights[0].id).toBe('ins-1')
  expect(parsed.insights[0].metadata.title).toBe('EV Count by County')
  expect(parsed.insights[0].chart_spec.plotlyData).toHaveLength(1)
  expect(parsed.insights[0].chart_spec.plotlyLayout).toHaveProperty('title')
})

it('defaults missing optional fields', () => {
  const parsed = parseInsights({
    insights: [
      {
        id: 'ins-2',
        metadata: {
          title: 'Simple chart',
          summary: 'A simple chart',
          keyIdea: 'Test defaults',
        },
        chart_spec: {
          traces: [],
        }
      }
    ]
  })

  expect(parsed.insights[0].metadata.description).toBeUndefined()
  expect(parsed.insights[0].chart_spec.plotlyData).toEqual([])
  expect(parsed.insights[0].chart_spec.plotlyLayout).toEqual({})
})
