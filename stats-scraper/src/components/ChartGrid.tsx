import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import { ChartCard } from './ChartCard'

interface ChartGridProps {
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  onRegenerate: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function ChartGrid({ insights, datasetsByInsightId, onRegenerate, onDelete }: ChartGridProps) {
  if (insights.length === 0) {
    return null
  }

  return (
    <section>
      <h2>Chart cards</h2>
      {insights.map((insight) => {
        const dataset = datasetsByInsightId[insight.id]

        if (!dataset) {
          return null
        }

        return (
          <ChartCard
            key={insight.id}
            insight={insight}
            dataset={dataset}
            onRegenerate={onRegenerate}
            onDelete={onDelete}
          />
        )
      })}
    </section>
  )
}
