export interface InsightMetadata {
  title: string
  summary: string
  keyIdea: string
  description?: string | null
}

export interface ChartSpec {
  traces: TraceSpec[]
  plotlyData: unknown[]
  plotlyLayout: Record<string, unknown>
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

export interface InsightCandidate {
  id: string
  metadata: InsightMetadata
  chart_spec: ChartSpec
}
