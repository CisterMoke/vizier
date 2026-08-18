import { useState } from 'preact/hooks'
import type { DatasetSchema, GeneratedDataset, InsightCandidate } from '../domain/types'

const EMPTY_SCHEMA: DatasetSchema = {
  source: '',
  fields: [],
  warnings: []
}

export interface WorkspaceState {
  rawSchema: string
  datasetSchema: DatasetSchema
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  demoSeed: number
}

export interface ExportPayload {
  schemaRaw: string
  datasetSchema: DatasetSchema
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  seed: number
  generatedAt: string
}

export const buildExportPayload = (state: WorkspaceState): ExportPayload => {
  return {
    schemaRaw: state.rawSchema,
    datasetSchema: state.datasetSchema,
    insights: state.insights,
    datasetsByInsightId: state.datasetsByInsightId,
    seed: state.demoSeed,
    generatedAt: new Date().toISOString()
  }
}

export const useWorkspaceStore = () => {
  const [rawSchema, setRawSchema] = useState('')
  const [datasetSchema, setDatasetSchema] = useState<DatasetSchema>(EMPTY_SCHEMA)
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
    return buildExportPayload({ rawSchema, datasetSchema, insights, datasetsByInsightId, demoSeed })
  }

  return {
    rawSchema,
    datasetSchema,
    insights,
    datasetsByInsightId,
    demoSeed,
    setRawSchema,
    setDatasetSchema,
    setInsights,
    attachDataset,
    removeInsight,
    exportReport
  }
}
