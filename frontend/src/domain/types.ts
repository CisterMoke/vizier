export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'datetime'

export type SemanticType =
  | 'identifier'
  | 'measure'
  | 'dimension'
  | 'timestamp'
  | 'currency'
  | 'percentage'
  | 'count'
  | 'text'
  | 'latitude'
  | 'longitude'
  | 'geohash'

export interface DatasetField {
  name: string
  jsonPath?: string
  type: FieldType
  nullable: boolean
  semanticType?: SemanticType
  sampleValues?: unknown[] | string
  unique?: boolean
  group?: string | null
}

export interface DatasetSchema {
  source: string
  fields: DatasetField[]
  warnings: string[]
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'heatmap' | 'geomap'

export interface ChartSpec {
  mode: 'recipe' | 'custom'
  chartType?: ChartType
  xAxis?: string
  yAxis?: string
  zAxis?: string | null
  plotlyData?: unknown[] | null
  plotlyLayout?: Record<string, unknown> | null
}

export type DataGenerator = 'category' | 'normal' | 'uniform' | 'linear' | 'constant'

export interface DataColumnSpec {
  name: string
  generator: DataGenerator
  categories?: string[] | null
  min?: number | null
  max?: number | null
  mean?: number | null
  stddev?: number | null
  start?: number | null
  end?: number | null
  step?: number | null
  value?: unknown | null
}

export interface DataProfile {
  rowCount: number
  columns: DataColumnSpec[]
}

export interface InsightCandidate {
  id: string
  title: string
  summary: string
  confidence: number
  hypothesis: string
  metricDescription: string
  chartSpec: ChartSpec | null
  dataProfile: DataProfile | null
  assumptions: string[]
  description?: string | null
}

export interface GeneratedDataset {
  id: string
  name: string
  columns: string[]
  rows: Record<string, unknown>[]
}

export interface ChartCard {
  id: string
  title: string
  chartType: ChartType
  datasetId: string
  insightId?: string
}

export type DataFormat = 'csv' | 'json' | 'jsonl' | 'unknown'

export interface RawDataResult {
  format: DataFormat
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
}

export interface FieldMapping {
  insightId: string
  mappings: Record<string, string>
}

export interface FieldMappingResult {
  mappings: FieldMapping[]
}
