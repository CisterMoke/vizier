import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import PlotlyComponent from 'react-plotly.js'
import { buildPlotlySpec } from '../services/chartSpec'

const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

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
      <p>{insight.hypothesis}</p>
      <p>Metric logic: {insight.metricDescription}</p>
      {insight.assumptions.length > 0 ? (
        <ul>
          {insight.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      ) : null}
      <Plot
        data={spec.data}
        layout={{ ...spec.layout, autosize: true }}
        config={{ responsive: true, displaylogo: false }}
        style={{ width: '100%', height: '320px' }}
        useResizeHandler
      />
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
