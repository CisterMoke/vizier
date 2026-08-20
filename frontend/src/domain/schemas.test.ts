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

it('parses an insight with traces array and aggregation', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-1',
        title: 'EV Count + Avg Range',
        summary: 'Bar chart with line overlay',
        keyIdea: 'Urban counties have more EVs',
        metricDescription: 'Count and avg range by county',
        chartSpec: {
          mode: 'recipe',
          traces: [
            {
              chartType: 'bar',
              xAxis: '$.county',
              yAxis: '$.dol_vehicle_id',
              aggregation: 'count',
              name: 'EV Count'
            },
            {
              chartType: 'line',
              xAxis: '$.county',
              yAxis: '$.electric_range',
              aggregation: 'mean',
              yaxis2: 'y2',
              name: 'Avg Range'
            }
          ]
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const spec = parsed.insights[0].chartSpec
  expect(spec.traces).toHaveLength(2)
  expect(spec.traces[0].chartType).toBe('bar')
  expect(spec.traces[0].aggregation).toBe('count')
  expect(spec.traces[1].yaxis2).toBe('y2')
})

it('parses an insight with traces and no aggregation', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-2',
        title: 'Simple bar',
        summary: 'Just a bar chart',
        keyIdea: 'Revenue varies',
        metricDescription: 'Revenue by category',
        chartSpec: {
          mode: 'recipe',
          traces: [
            { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue' }
          ]
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const spec = parsed.insights[0].chartSpec
  expect(spec.traces).toHaveLength(1)
  expect(spec.traces[0].chartType).toBe('bar')
  expect(spec.traces[0].aggregation).toBeUndefined()
})

it('defaults chartSpec traces to empty array when omitted', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-3',
        title: 'No traces',
        summary: 'Empty chart spec',
        keyIdea: 'Test',
        metricDescription: 'Test',
        chartSpec: {
          mode: 'recipe'
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const spec = parsed.insights[0].chartSpec
  expect(spec.traces).toEqual([])
})

it('parses filter value from JSON-encoded string to array', () => {
  const parsed = parseInsightEnvelope({
    insights: [
      {
        id: 'ins-filter',
        title: 'Filtered chart',
        summary: 'Chart with filter',
        keyIdea: 'Test filter parsing',
        metricDescription: 'Test',
        chartSpec: {
          mode: 'recipe',
          traces: [
            {
              chartType: 'bar',
              xAxis: '$.make',
              yAxis: '$.count',
              filter: {
                field: '$.make',
                op: 'in',
                value: '["TESLA", "NISSAN", "FORD"]'
              }
            }
          ]
        },
        dataProfile: null,
        assumptions: []
      }
    ]
  })

  const filter = parsed.insights[0].chartSpec.traces[0].filter
  expect(Array.isArray(filter!.value)).toBe(true)
  expect(filter!.value).toEqual(['TESLA', 'NISSAN', 'FORD'])
})
