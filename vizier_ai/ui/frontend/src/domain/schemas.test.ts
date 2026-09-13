import { parseInsightEnvelope } from './schemas'

it('parses an insight with plotlyData and plotlyLayout', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-1',
        title: 'EV Count by County',
        summary: 'Bar chart showing EV count',
        keyIdea: 'Urban counties have more EVs',
        metricDescription: 'Count of EVs by county',
        assumptions: ['Data is complete'],
        plotlyData: [{ type: 'bar', x: ['King', 'Pierce'], y: [500, 200] }],
        plotlyLayout: { title: { text: 'EV Count' } }
      }
    ]
  })

  expect(parsed.insights[0].id).toBe('ins-1')
  expect(parsed.insights[0].plotlyData).toHaveLength(1)
  expect(parsed.insights[0].plotlyLayout).toHaveProperty('title')
})

it('defaults missing optional fields', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-2',
        title: 'Simple chart',
        summary: 'A simple chart',
        keyIdea: 'Test defaults',
        plotlyData: [{ type: 'bar' }],
        plotlyLayout: {}
      }
    ]
  })

  expect(parsed.insights[0].metricDescription).toBe('')
  expect(parsed.insights[0].assumptions).toEqual([])
})
