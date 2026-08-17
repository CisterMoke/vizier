import { useState } from 'preact/hooks'
import type { CanonicalSchema, GeneratedDataset, InsightCandidate } from '../domain/types'

const EMPTY_SCHEMA: CanonicalSchema = {
  entities: [],
  relationships: [],
  warnings: []
}

export interface WorkspaceState {
  rawSchema: string
  canonicalSchema: CanonicalSchema
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  demoSeed: number
}

export interface ExportPayload {
  schemaRaw: string
  canonicalSchema: CanonicalSchema
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  seed: number
  generatedAt: string
}

export const buildExportPayload = (state: WorkspaceState): ExportPayload => {
  return {
    schemaRaw: state.rawSchema,
    canonicalSchema: state.canonicalSchema,
    insights: state.insights,
    datasetsByInsightId: state.datasetsByInsightId,
    seed: state.demoSeed,
    generatedAt: new Date().toISOString()
  }
}

export const useWorkspaceStore = () => {
  const [rawSchema, setRawSchema] = useState('')
  const [canonicalSchema, setCanonicalSchema] = useState<CanonicalSchema>(EMPTY_SCHEMA)
  const [insights, setInsightsState] = useState<InsightCandidate[]>([])
  const [datasetsByInsightId, setDatasetsByInsightId] = useState<Record<string, GeneratedDataset>>({})
  const [demoSeed] = useState(1337)

  const setInsights = (items: InsightCandidate[]) => {
    const nextInsightIds = new Set(items.map((item) => item.id))
    setInsightsState(items)
    setDatasetsByInsightId((current) => {
      const next: Record<string, GeneratedDataset> = {}
      for (const insightId of Object.keys(current)) {
        if (nextInsightIds.has(insightId)) {
          next[insightId] = current[insightId]
        }
      }
      return next
    })
  }

  const attachDataset = (insightId: string, dataset: GeneratedDataset) => {
    setDatasetsByInsightId((current) => ({ ...current, [insightId]: dataset }))
  }

  const removeInsight = (insightId: string) => {
    setInsightsState((current) => current.filter((item) => item.id !== insightId))
    setDatasetsByInsightId((current) => {
      const next = { ...current }
      delete next[insightId]
      return next
    })
  }

  const exportReport = (): ExportPayload => {
    return buildExportPayload({ rawSchema, canonicalSchema, insights, datasetsByInsightId, demoSeed })
  }

  return {
    rawSchema,
    canonicalSchema,
    insights,
    datasetsByInsightId,
    demoSeed,
    setRawSchema,
    setCanonicalSchema,
    setInsights,
    attachDataset,
    removeInsight,
    exportReport
  }
}
