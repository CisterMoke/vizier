export type CanonicalFieldType = 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'unknown'

export interface CanonicalField {
  name: string
  type: CanonicalFieldType
  nullable: boolean
}

export interface CanonicalEntity {
  name: string
  fields: CanonicalField[]
}

export interface CanonicalRelationship {
  fromEntity: string
  fromField: string
  toEntity: string
  toField: string
}

export interface CanonicalSchema {
  entities: CanonicalEntity[]
  relationships: CanonicalRelationship[]
  warnings: string[]
}

export interface InsightCandidate {
  id: string
  title: string
  summary: string
  confidence: number
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
  chartType: 'bar' | 'line' | 'pie' | 'table'
  datasetId: string
  insightId?: string
}
