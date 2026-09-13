import { useState } from 'preact/hooks'
import type { DatasetSchema, InsightCandidate } from '../domain/types'

const EMPTY_SCHEMA: DatasetSchema = {
  source: '',
  fields: [],
  warnings: []
}

export const useWorkspaceStore = () => {
  const [rawSchema, setRawSchema] = useState('')
  const [datasetSchema, setDatasetSchema] = useState<DatasetSchema>(EMPTY_SCHEMA)
  const [insights, setInsights] = useState<InsightCandidate[]>([])

  const removeInsight = (insightId: string) => {
    setInsights((current) => current.filter((item) => item.id !== insightId))
  }

  return {
    rawSchema,
    datasetSchema,
    insights,
    setRawSchema,
    setDatasetSchema,
    setInsights,
    removeInsight
  }
}
