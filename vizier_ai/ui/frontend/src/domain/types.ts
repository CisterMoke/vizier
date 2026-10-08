import type { InsightConstraintsPayload } from './constraints'
import type { CsvOptionsPayload } from './csv'
import type { ExcelOptionsPayload } from './excel'

export interface InsightMetadata {
  title: string
  summary: string
  description?: string | null
}

export interface ChartSpec {
  traces: TraceSpec[]
  plotlyData: unknown[] | null
  plotlyLayout: Record<string, unknown> | null
  isStatic?: boolean
}

export interface TraceSpec {
  chart_type: string
  x_axis: string
  y_axis: string
  z_axis?: string | null
  aggregation?: string | null
  filter?: { field: string; op: string; value: unknown } | null
  name?: string | null
}

export interface DatasetSchemaField {
  name: string
  jsonPath: string
  type: string
  semanticType?: string | null
}

export interface DatasetSchema {
  source: string
  fields: DatasetSchemaField[]
}

export interface InsightCandidate {
  id: string
  metadata: InsightMetadata
  chart_spec: ChartSpec
  mock_seed?: number | null
}

export type DataSourceMode = 'none' | 'file' | 'rest' | 'sql'
export type FileFormat = 'csv' | 'json' | 'jsonl' | 'excel'

export interface RestApiConfig {
  method: string
  url: string
  headers: string
  body: string
}

export interface SqlConfig {
  connectionString: string
  query: string
}

export interface GenerateRequest {
  schemaText: string
  dataSource: {
    mode: DataSourceMode
    file?: File
    fileFormat?: FileFormat
    rest?: RestApiConfig
    sql?: SqlConfig
  }
  constraints?: InsightConstraintsPayload
  csvOptions?: CsvOptionsPayload
  excelOptions?: ExcelOptionsPayload
}
