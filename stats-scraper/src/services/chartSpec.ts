import type { ChartSpec, GeneratedDataset, InsightCandidate } from '../domain/types'
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

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  return 0
}

const buildBarChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[spec.xAxis ?? '']))
  const y = dataset.rows.map((row) => toDatum(row[spec.yAxis ?? '']))

  return {
    data: [{ type: 'bar', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: spec.xAxis } },
      yaxis: { title: { text: spec.yAxis } }
    }
  }
}

const buildLineChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[spec.xAxis ?? '']))
  const y = dataset.rows.map((row) => toDatum(row[spec.yAxis ?? '']))

  return {
    data: [{ type: 'scatter', mode: 'lines+markers', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: spec.xAxis } },
      yaxis: { title: { text: spec.yAxis } }
    }
  }
}

const buildPieChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const labels = dataset.rows.map((row) => toDatum(row[spec.xAxis ?? '']))
  const values = dataset.rows.map((row) => toDatum(row[spec.yAxis ?? '']))

  return {
    data: [{ type: 'pie', labels, values }],
    layout: { title: { text: title } }
  }
}

const buildScatterChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toDatum(row[spec.xAxis ?? '']))
  const y = dataset.rows.map((row) => toDatum(row[spec.yAxis ?? '']))

  return {
    data: [{ type: 'scatter', mode: 'markers', x, y }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: spec.xAxis } },
      yaxis: { title: { text: spec.yAxis } }
    }
  }
}

const buildHeatmapChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const x = dataset.rows.map((row) => toNumber(row[spec.xAxis ?? '']))
  const y = dataset.rows.map((row) => toNumber(row[spec.yAxis ?? '']))
  const z = spec.zAxis
    ? dataset.rows.map((row) => toNumber(row[spec.zAxis!]))
    : dataset.rows.map((_, i) => i + 1)

  return {
    data: [{ type: 'heatmap', x, y, z }],
    layout: {
      title: { text: title },
      xaxis: { title: { text: spec.xAxis } },
      yaxis: { title: { text: spec.yAxis } }
    }
  }
}

const buildGeomapChart = (spec: ChartSpec, dataset: GeneratedDataset, title: string): PlotlySpec => {
  const lon = dataset.rows.map((row) => toNumber(row[spec.xAxis ?? '']))
  const lat = dataset.rows.map((row) => toNumber(row[spec.yAxis ?? '']))
  const z = spec.zAxis
    ? dataset.rows.map((row) => toNumber(row[spec.zAxis!]))
    : undefined

  return {
    data: [{
      type: 'scattergeo',
      mode: 'markers',
      lon,
      lat,
      ...(z ? {
        marker: {
          size: 8,
          color: z,
          colorscale: 'Viridis',
          showscale: true,
          colorbar: { title: { text: spec.zAxis ?? '' } }
        }
      } : {
        marker: { size: 8, color: '#22d3ee' }
      })
    }],
    layout: {
      title: { text: title },
      geo: {
        showland: true,
        landcolor: 'rgb(17, 24, 39)',
        showocean: true,
        oceancolor: 'rgb(8, 12, 20)',
        showcountries: true,
        countrycolor: 'rgb(55, 65, 81)',
        showcoastlines: true,
        coastlinecolor: 'rgb(55, 65, 81)',
        projection: { type: 'natural earth' }
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent'
    }
  }
}

const buildCustomChart = (spec: ChartSpec, _title: string): PlotlySpec => {
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
    case 'heatmap':
      return buildHeatmapChart(spec, dataset, title)
    case 'geomap':
      return buildGeomapChart(spec, dataset, title)
    default:
      return buildBarChart(spec, dataset, title)
  }
}
