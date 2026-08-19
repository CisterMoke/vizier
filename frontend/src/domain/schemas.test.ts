import { parseDatasetSchema } from './schemas'

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
