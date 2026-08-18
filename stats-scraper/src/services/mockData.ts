import type { DataColumnSpec, DatasetSchema, GeneratedDataset, InsightCandidate } from '../domain/types'

type MockDataOptions = {
  seed?: number
  rowCount?: number
}

const createSeededRandom = (seed: number): (() => number) => {
  let state = (seed >>> 0) || 1

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

const clamp = (value: number, min?: number, max?: number): number => {
  let result = value
  if (min !== undefined && result < min) result = min
  if (max !== undefined && result > max) result = max
  return result
}

const generateCategory = (spec: DataColumnSpec, random: () => number): unknown => {
  const categories = spec.categories ?? ['A', 'B', 'C']
  return categories[Math.floor(random() * categories.length)]
}

const generateNormal = (spec: DataColumnSpec, random: () => number): number => {
  const mean = spec.mean ?? 0
  const stddev = spec.stddev ?? 1
  const u1 = Math.max(random(), 1e-10)
  const u2 = random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return clamp(Math.round((mean + z * stddev) * 100) / 100, spec.min, spec.max)
}

const generateUniform = (spec: DataColumnSpec, random: () => number): number => {
  const min = spec.min ?? 0
  const max = spec.max ?? 100
  return clamp(Math.round((min + random() * (max - min)) * 100) / 100, spec.min, spec.max)
}

const generateLinear = (spec: DataColumnSpec, index: number): number => {
  const start = spec.start ?? 0
  const end = spec.end ?? 100
  const step = spec.step ?? (end - start) / 200
  return Math.round((start + index * step) * 100) / 100
}

const generateConstant = (spec: DataColumnSpec): unknown => {
  return spec.value ?? 0
}

const generateValue = (spec: DataColumnSpec, index: number, random: () => number): unknown => {
  switch (spec.generator) {
    case 'category':
      return generateCategory(spec, random)
    case 'normal':
      return generateNormal(spec, random)
    case 'uniform':
      return generateUniform(spec, random)
    case 'linear':
      return generateLinear(spec, index)
    case 'constant':
      return generateConstant(spec)
    default:
      return null
  }
}

export const generateMockDataset = (
  _schema: DatasetSchema,
  insight: InsightCandidate,
  opts: MockDataOptions = {}
): GeneratedDataset => {
  const seed = opts.seed ?? 1337
  const profile = insight.dataProfile
  const rowCount = opts.rowCount ?? profile?.rowCount ?? 200
  const random = createSeededRandom(seed)
  const columns = profile?.columns ?? []
  const columnNames = columns.map((col) => col.name)

  const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
    const row: Record<string, unknown> = {}

    for (const col of columns) {
      row[col.name] = generateValue(col, rowIndex, random)
    }

    return row
  })

  return {
    id: `dataset-${insight.id}-${seed}`,
    name: `${insight.title} sample`,
    columns: columnNames.length > 0 ? columnNames : ['x', 'y'],
    rows
  }
}
