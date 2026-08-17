import type { CanonicalSchema, GeneratedDataset, InsightCandidate } from '../domain/types'

type MockDataOptions = {
  seed?: number
  rowCount?: number
}

type ColumnDef = {
  key: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown'
  nullable: boolean
}

const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const buildColumns = (schema: CanonicalSchema): ColumnDef[] => {
  return schema.entities.flatMap((entity) =>
    entity.fields.map((field) => ({
      key: `${entity.name}.${field.name}`,
      type: field.type,
      nullable: field.nullable
    }))
  )
}

const toMockValue = (column: ColumnDef, index: number, random: () => number): unknown => {
  if (column.nullable && random() < 0.1) {
    return null
  }

  if (column.type === 'number') {
    return Math.round(random() * 10000) / 100
  }

  if (column.type === 'boolean') {
    return random() >= 0.5
  }

  if (column.type === 'date') {
    const dayOffset = Math.floor(random() * 365)
    const ms = Date.UTC(2024, 0, 1) + dayOffset * 86400000
    return new Date(ms).toISOString().slice(0, 10)
  }

  if (column.type === 'datetime') {
    const secondOffset = Math.floor(random() * 31536000)
    const ms = Date.UTC(2024, 0, 1) + secondOffset * 1000
    return new Date(ms).toISOString()
  }

  return `${column.key}-${index + 1}-${Math.floor(random() * 1000)}`
}

export const generateMockDataset = (
  schema: CanonicalSchema,
  insight: InsightCandidate,
  opts: MockDataOptions = {}
): GeneratedDataset => {
  const seed = opts.seed ?? 1337
  const rowCount = opts.rowCount ?? 200
  const random = createSeededRandom(seed)
  const columns = buildColumns(schema)
  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const row: Record<string, unknown> = {}

    for (const column of columns) {
      row[column.key] = toMockValue(column, rowIndex, random)
    }

    return row
  })

  return {
    id: `dataset-${insight.id}-${seed}`,
    name: `${insight.title} sample`,
    columns: columns.map((column) => column.key),
    rows
  }
}
