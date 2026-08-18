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

export interface DatasetField {
  name: string
  type: FieldType
  nullable: boolean
  semanticType?: SemanticType
  sampleValues?: unknown[]
  unique?: boolean
  group?: string
}

export interface DatasetSchema {
  source: string
  fields: DatasetField[]
  warnings: string[]
}

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter'

export type Aggregation = 'sum' | 'count' | 'avg' | 'none'

export interface ChartRecipe {
  mode: 'recipe'
  chartType: ChartType
  xAxis: { column: string; aggregation: Aggregation }
  yAxis: { column: string; aggregation: Aggregation }
  groupBy?: string
}

export interface ChartCustom {
  mode: 'custom'
  plotlyData: unknown[]
  plotlyLayout: Record<string, unknown>
}

export type ChartSpec = ChartRecipe | ChartCustom

export type DataGenerator = 'category' | 'normal' | 'uniform' | 'linear' | 'constant'

export interface DataColumnSpec {
  name: string
  generator: DataGenerator
  categories?: string[]
  min?: number
  max?: number
  mean?: number
  stddev?: number
  start?: number
  end?: number
  step?: number
  value?: unknown
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
  chartSpec: ChartSpec
  dataProfile: DataProfile
  assumptions: string[]
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
