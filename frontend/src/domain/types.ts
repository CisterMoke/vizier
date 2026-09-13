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

export interface InsightCandidate {
  id: string
  title: string
  summary: string
  keyIdea: string
  metricDescription: string
  assumptions: string[]
  plotlyData: unknown[]
  plotlyLayout: Record<string, unknown>
  description?: string | null
}

export interface DatasetSchema {
  source: string
  fields: DatasetField[]
  warnings: string[]
}
