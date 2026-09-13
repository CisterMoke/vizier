export interface InsightCandidate {
  id: string
  title: string
  summary: string
  keyIdea: string
  metricDescription: string
  assumptions: string[]
  plotlyData: unknown[]
  plotlyLayout: Record<string, unknown>
}
