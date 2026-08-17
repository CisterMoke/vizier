import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import { buildPlotlySpec } from '../services/chartSpec'

interface ChartCardProps {
  insight: InsightCandidate
  dataset: GeneratedDataset
  onRegenerate: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function ChartCard({ insight, dataset, onRegenerate, onDelete }: ChartCardProps) {
  const spec = buildPlotlySpec(insight, dataset)
  const trace = spec.data[0]

  return (
    <article data-testid="chart-card">
      <h3>{insight.title}</h3>
      <p>{insight.summary}</p>
      <p>Confidence: {(insight.confidence * 100).toFixed(0)}%</p>
      <p>
        Chart type: <strong>{trace?.type ?? 'unknown'}</strong>
      </p>
      <p>
        Data source: {dataset.name} ({dataset.rows.length} rows)
      </p>
      <div>
        <button type="button" onClick={() => onRegenerate(insight.id)}>
          Regenerate
        </button>
        <button type="button" onClick={() => onDelete(insight.id)}>
          Delete
        </button>
      </div>
    </article>
  )
}
