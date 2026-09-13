import { useState } from 'preact/hooks'
import type { InsightCandidate } from '../domain/types'

export const useWorkspaceStore = () => {
  const [insights, setInsights] = useState<InsightCandidate[]>([])

  const removeInsight = (insightId: string) => {
    setInsights((current) => current.filter((item) => item.id !== insightId))
  }

  return {
    insights,
    setInsights,
    removeInsight
  }
}
