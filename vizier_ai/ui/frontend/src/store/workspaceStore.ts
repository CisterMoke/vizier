import { useState } from 'react'
import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'
import type { CsvOptionsPayload } from '../domain/csv'

export const useWorkspaceStore = () => {
  const [insights, setInsights] = useState<InsightCandidate[]>([])
  const [sessionId, setSessionId] = useState('')
  const [bundleContext, setBundleContext] = useState<BundleContext | null>(null)
  const [csvOptions, setCsvOptions] = useState<CsvOptionsPayload | null>(null)

  const removeInsight = (insightId: string) => {
    setInsights((current) => current.filter((item) => item.id !== insightId))
  }

  return {
    insights,
    sessionId,
    bundleContext,
    csvOptions,
    setInsights,
    setSessionId,
    setBundleContext,
    setCsvOptions,
    removeInsight
  }
}
