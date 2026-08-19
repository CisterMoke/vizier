import type { ChartRecipe, ChartSpec, GeneratedDataset, InsightCandidate } from '../domain/types'
import type * as Plotly from 'plotly.js'

export type PlotlySpec = { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }

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

const buildBarChart = (recipe: ChartRecipe, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[recipe.xAxis]))
  const y = dataset.rows.map((row) => toDatum(row[recipe.yAxis]))

  return {
    data: [{ type: 'bar', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: recipe.xAxis } },
      yaxis: { title: { text: recipe.yAxis } }
    }
  }
}

const buildLineChart = (recipe: ChartRecipe, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[recipe.xAxis]))
  const y = dataset.rows.map((row) => toDatum(row[recipe.yAxis]))

  return {
    data: [{ type: 'scatter', mode: 'lines+markers', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: recipe.xAxis } },
      yaxis: { title: { text: recipe.yAxis } }
    }
  }
}

const buildPieChart = (recipe: ChartRecipe, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const labels = dataset.rows.map((row) => toDatum(row[recipe.xAxis]))
  const values = dataset.rows.map((row) => toDatum(row[recipe.yAxis]))

  return {
    data: [{ type: 'pie', labels, values }],
    layout: { title: { text: title } }
  }
}

const buildScatterChart = (recipe: ChartRecipe, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[recipe.xAxis]))
  const y = dataset.rows.map((row) => toDatum(row[recipe.yAxis]))

  return {
    data: [{ type: 'scatter', mode: 'markers', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: recipe.xAxis } },
      yaxis: { title: { text: recipe.yAxis } }
    }
  }
}

const buildCustomChart = (spec: ChartSpec & { mode: 'custom' }, _title: string): PlotlySpec => {
  const layout = (spec.plotlyLayout as Partial<Plotly.Layout>) ?? {}
  return {
    data: (spec.plotlyData as Plotly.Data[]) ?? [],
    layout: {
      ...layout,
      title: layout.title ?? { text: _title }
    }
  }
}

export const buildPlotlySpec = (
  insight: InsightCandidate,
  dataset: GeneratedDataset
): PlotlySpec => {
  const spec = insight.chartSpec
  const title = insight.title

  if (spec.mode === 'custom') {
    return buildCustomChart(spec, title)
  }

  switch (spec.chartType) {
    case 'bar':
      return buildBarChart(spec, dataset, title)
    case 'line':
      return buildLineChart(spec, dataset, title)
    case 'pie':
      return buildPieChart(spec, dataset, title)
    case 'scatter':
      return buildScatterChart(spec, dataset, title)
    default:
      return buildBarChart(spec, dataset, title)
  }
}
