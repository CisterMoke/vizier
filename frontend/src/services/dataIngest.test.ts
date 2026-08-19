import { parseRawData, buildDatasetFromRaw } from './dataIngest'
import type { RawDataResult } from '../domain/types'

it('parses CSV data with headers and numeric conversion', () => {
  const result = parseRawData('name,age,score\nAlice,30,95.5\nBob,25,87.3')

  expect(result.format).toBe('csv')
  expect(result.columns).toEqual(['name', 'age', 'score'])
  expect(result.rowCount).toBe(2)
  expect(result.rows[0]).toEqual({ name: 'Alice', age: 30, score: 95.5 })
  expect(result.rows[1]).toEqual({ name: 'Bob', age: 25, score: 87.3 })
})

it('parses JSON array preserving nested objects', () => {
  const result = parseRawData('[{"id":1,"info":{"name":"Alice","city":"NYC"}},{"id":2,"info":{"name":"Bob","city":"LA"}}]')

  expect(result.format).toBe('json')
  expect(result.rowCount).toBe(2)
  expect(result.columns).toContain('id')
  expect(result.rows[0].info).toEqual({ name: 'Alice', city: 'NYC' })
  expect(result.rows[0].info.name).toBe('Alice')
})

it('parses JSONL data with one JSON object per line', () => {
  const result = parseRawData('{"id":1,"value":100}\n{"id":2,"value":200}')

  expect(result.format).toBe('jsonl')
  expect(result.rowCount).toBe(2)
  expect(result.columns).toEqual(['id', 'value'])
  expect(result.rows[0]).toEqual({ id: 1, value: 100 })
})

it('returns unknown format for empty or invalid data', () => {
  expect(parseRawData('').format).toBe('unknown')
  expect(parseRawData('hello world').format).toBe('unknown')
})

it('handles CSV with quoted values containing commas', () => {
  const result = parseRawData('name,note\n"Smith, John",hello\n"Doe, Jane",world')

  expect(result.rows[0].name).toBe('Smith, John')
  expect(result.rows[1].note).toBe('world')
})

it('builds a GeneratedDataset from raw data', () => {
  const raw: RawDataResult = {
    format: 'csv',
    columns: ['x', 'y'],
    rows: [{ x: 1, y: 10 }, { x: 2, y: 20 }],
    rowCount: 2
  }

  const dataset = buildDatasetFromRaw('ins-1', raw)

  expect(dataset.id).toBe('dataset-ins-1-real')
  expect(dataset.columns).toEqual(['x', 'y'])
  expect(dataset.rows).toHaveLength(2)
  expect(dataset.rows[0].x).toBe(1)
})
