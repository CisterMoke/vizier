import { resolveValues } from './jsonPath'
import type { GeneratedDataset } from '../domain/types'

const mockDataset: GeneratedDataset = {
  id: 'ds-1',
  name: 'test',
  columns: ['county', 'revenue'],
  rows: [
    { county: 'King', revenue: 120 },
    { county: 'Pierce', revenue: 95 }
  ]
}

const nestedDataset: GeneratedDataset = {
  id: 'ds-2',
  name: 'nested',
  columns: ['geocoded_column.longitude', 'geocoded_column.latitude'],
  rows: [
    { geocoded_column: { longitude: -122.3, latitude: 47.6 } },
    { geocoded_column: { longitude: -120.5, latitude: 46.5 } }
  ]
}

it('resolves a simple top-level JSONPath', () => {
  const values = resolveValues(mockDataset, '$.county')
  expect(values).toEqual(['King', 'Pierce'])
})

it('resolves a nested JSONPath', () => {
  const values = resolveValues(nestedDataset, '$.geocoded_column.longitude')
  expect(values).toEqual([-122.3, -120.5])
})

it('resolves a JSONPath that does not match (returns nulls)', () => {
  const values = resolveValues(mockDataset, '$.nonexistent')
  expect(values).toEqual([null, null])
})

it('handles plain column name as fallback (no $ prefix)', () => {
  const values = resolveValues(mockDataset, 'county')
  expect(values).toEqual(['King', 'Pierce'])
})
