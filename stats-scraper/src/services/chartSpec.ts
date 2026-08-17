import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import type * as Plotly from 'plotly.js'

const inferChartType = (insight: InsightCandidate): 'bar' | 'pie' | 'scatter' => {
  const text = `${insight.title} ${insight.summary}`.toLowerCase()

  if (text.includes('pie') || text.includes('share') || text.includes('proportion')) {
    return 'pie'
  }

  if (text.includes('bar') || text.includes('histogram') || text.includes('distribution')) {
    return 'bar'
  }

  return 'scatter'
}

export const buildPlotlySpec = (
  insight: InsightCandidate,
  dataset: GeneratedDataset
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } => {
  const xColumn = dataset.columns[0]
  const yColumn = dataset.columns[1] ?? dataset.columns[0]
  const toDatum = (value: unknown): Plotly.Datum => {
    if (typeof value === 'number' || typeof value === 'string') {
      return value
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false'
    }

    if (value instanceof Date) {
      return value.toISOString()
    }

    return String(value)
  }

  const x = dataset.rows.map((row) => toDatum(row[xColumn]))
  const y = dataset.rows.map((row) => toDatum(row[yColumn]))
  const chartType = inferChartType(insight)

  if (chartType === 'pie') {
    return {
      data: [{ type: 'pie', labels: x, values: y }],
      layout: { title: { text: insight.title } }
    }
  }

  if (chartType === 'bar') {
    return {
      data: [{ type: 'bar', x, y }],
      layout: { title: { text: insight.title } }
    }
  }

  return {
    data: [{ type: 'scatter', mode: 'lines+markers', x, y }],
    layout: { title: { text: insight.title } }
  }
}

export type PlotlySpec = { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }
