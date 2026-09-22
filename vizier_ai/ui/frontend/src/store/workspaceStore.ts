import { useState } from 'preact/hooks'
import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'

export const useWorkspaceStore = () => {
  const [insights, setInsights] = useState<InsightCandidate[]>([])
  const [sessionId, setSessionId] = useState('')
  const [bundleContext, setBundleContext] = useState<BundleContext | null>(null)

  const removeInsight = (insightId: string) => {
    setInsights((current) => current.filter((item) => item.id !== insightId))
  }

  return {
    insights,
    sessionId,
    bundleContext,
    setInsights,
    setSessionId,
    setBundleContext,
    removeInsight
  }
}
