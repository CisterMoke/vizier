import { parseDatasetSchema, parseInsightEnvelope } from './schemas'

it('accepts a minimal dataset schema payload', () => {
  const parsed = parseDatasetSchema({
    source: 'SQL: orders table',
    fields: [{ name: 'id', type: 'number', nullable: false }],
    warnings: []
  })

  expect(parsed.fields[0].name).toBe('id')
  expect(parsed.source).toBe('SQL: orders table')
})

it('accepts dataset schema with semantic types and sample values', () => {
  const parsed = parseDatasetSchema({
    source: 'CSV: sales_data.csv',
    fields: [
      { name: 'revenue', type: 'number', nullable: false, semanticType: 'currency', sampleValues: [49.99, 129.5] },
      { name: 'segment', type: 'string', nullable: false, semanticType: 'dimension', sampleValues: ['Enterprise', 'SMB'] }
    ],
    warnings: []
  })

  expect(parsed.fields[0].semanticType).toBe('currency')
  expect(parsed.fields[1].sampleValues).toHaveLength(2)
})

it('accepts a dataset schema with jsonPath on fields', () => {
  const parsed = parseDatasetSchema({
    source: 'REST API: EV population',
    fields: [
      { name: 'county', jsonPath: '$.county', type: 'string', nullable: false, semanticType: 'dimension' },
      { name: 'longitude', jsonPath: '$.geocoded_column.longitude', type: 'number', nullable: false, semanticType: 'longitude' }
    ],
    warnings: []
  })

  expect(parsed.fields[0].jsonPath).toBe('$.county')
  expect(parsed.fields[1].jsonPath).toBe('$.geocoded_column.longitude')
})

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
