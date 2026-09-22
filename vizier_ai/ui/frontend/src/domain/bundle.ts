import type { InsightCandidate, TraceSpec } from './types'

export interface BundleContext {
  schema: unknown
  dataProfile: unknown
}

export interface SavedInsightJson {
  id: string
  metadata: InsightCandidate['metadata']
  traces: TraceSpec[]
  mock_seed?: number | null
}

export interface DownloadBundle {
  version: 1
  schema: unknown
  data_profile?: unknown
  insights: SavedInsightJson[]
}

export function buildDownloadBundle(
  insights: InsightCandidate[],
  context: BundleContext | null
): DownloadBundle | null {
  if (!context?.schema) {
    return null
  }

  const bundle: DownloadBundle = {
    version: 1,
    schema: context.schema,
    insights: insights.map((insight) => ({
      id: insight.id,
      metadata: insight.metadata,
      traces: insight.chart_spec.traces,
      mock_seed: insight.mock_seed ?? null
    }))
  }
  if (context.dataProfile) {
    bundle.data_profile = context.dataProfile
  }
  return bundle
}
