import type { GeneratedDataset, InsightCandidate } from '../domain/types'

type PlotlyTrace = {
  type: 'bar' | 'pie' | 'scatter'
  mode?: 'lines+markers'
  x?: unknown[]
  y?: unknown[]
  labels?: unknown[]
  values?: unknown[]
}

type PlotlySpec = {
  data: PlotlyTrace[]
  layout: {
    title: string
  }
}

const inferChartType = (insight: InsightCandidate): PlotlyTrace['type'] => {
  const text = `${insight.title} ${insight.summary}`.toLowerCase()

  if (text.includes('pie') || text.includes('share') || text.includes('proportion')) {
    return 'pie'
  }

  if (text.includes('bar') || text.includes('histogram') || text.includes('distribution')) {
    return 'bar'
  }

  return 'scatter'
}

export const buildPlotlySpec = (insight: InsightCandidate, dataset: GeneratedDataset): PlotlySpec => {
  const xColumn = dataset.columns[0]
  const yColumn = dataset.columns[1] ?? dataset.columns[0]
  const x = dataset.rows.map((row) => row[xColumn])
  const y = dataset.rows.map((row) => row[yColumn])
  const chartType = inferChartType(insight)

  if (chartType === 'pie') {
    return {
      data: [{ type: 'pie', labels: x, values: y }],
      layout: { title: insight.title }
    }
  }

  if (chartType === 'bar') {
    return {
      data: [{ type: 'bar', x, y }],
      layout: { title: insight.title }
    }
  }

  return {
    data: [{ type: 'scatter', mode: 'lines+markers', x, y }],
    layout: { title: insight.title }
  }
}

export type { PlotlySpec, PlotlyTrace }
