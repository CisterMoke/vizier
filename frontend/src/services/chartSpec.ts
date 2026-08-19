import type { ChartSpec, ChartType, GeneratedDataset, InsightCandidate, TraceSpec } from '../domain/types'
import type * as Plotly from 'plotly.js'
import { resolveValues } from './jsonPath'

export type PlotlySpec = { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }

const FONT_COLOR = '#e2e8f0'
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)'
const AXIS_COLOR = '#94a3b8'
const PAPER_BG = 'rgba(15, 23, 42, 0.4)'
const PLOT_BG = 'rgba(15, 23, 42, 0.2)'

const TRACE_COLORS = ['#22d3ee', '#818cf8', '#f472b6', '#fbbf24', '#34d399', '#fb923c', '#a78bfa', '#f9a8d4']

const darkLayout = (title: string): Partial<Plotly.Layout> => ({
  title: { text: title, font: { color: FONT_COLOR, size: 14 } },
  font: { color: FONT_COLOR },
  paper_bgcolor: PAPER_BG,
  plot_bgcolor: PLOT_BG,
  margin: { l: 48, r: 48, b: 48, t: 48 }
})

const darkAxes = (xLabel?: string, yLabel?: string) => ({
  xaxis: {
    title: { text: xLabel ?? '', font: { color: FONT_COLOR } },
    color: AXIS_COLOR,
    gridcolor: GRID_COLOR,
    zerolinecolor: GRID_COLOR
  },
  yaxis: {
    title: { text: yLabel ?? '', font: { color: FONT_COLOR } },
    color: AXIS_COLOR,
    gridcolor: GRID_COLOR,
    zerolinecolor: GRID_COLOR
  }
})

const toDatum = (value: unknown): Plotly.Datum => {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value
  return 0
}

const toAxisLabel = (jsonPath: string): string => {
  const parts = jsonPath.replace(/^\$\.?/, '').split('.')
  return parts[parts.length - 1] ?? jsonPath
}

interface ResolvedTrace {
  type?: Plotly.Data['type']
  x?: Plotly.Datum[]
  y?: Plotly.Datum[]
  z?: Plotly.Datum[] | Plotly.Datum[][]
  labels?: Plotly.Datum[]
  values?: Plotly.Datum[]
  lon?: number[]
  lat?: number[]
  mode?: string
  marker?: Record<string, unknown>
  line?: Record<string, unknown>
  textfont?: Record<string, unknown>
  transforms?: unknown[]
  yaxis?: string
  name?: string
}

const buildTraceData = (
  traceSpec: TraceSpec,
  dataset: GeneratedDataset,
  colorIndex: number
): ResolvedTrace => {
  const color = TRACE_COLORS[colorIndex % TRACE_COLORS.length]
  const x = resolveValues(dataset, traceSpec.xAxis).map(toDatum)
  const y = resolveValues(dataset, traceSpec.yAxis).map(toDatum)
  const z = traceSpec.zAxis ? resolveValues(dataset, traceSpec.zAxis).map(toNumber) : undefined

  const trace: ResolvedTrace = { name: traceSpec.name ?? undefined }

  switch (traceSpec.chartType) {
    case 'bar':
      trace.type = 'bar'
      trace.x = x
      trace.y = y
      trace.marker = { color }
      break
    case 'line':
      trace.type = 'scatter'
      trace.mode = 'lines+markers'
      trace.x = x
      trace.y = y
      trace.line = { color }
      trace.marker = { color }
      break
    case 'scatter':
      trace.type = 'scatter'
      trace.mode = 'markers'
      trace.x = x
      trace.y = y
      trace.marker = { color, size: 8 }
      break
    case 'pie':
      trace.type = 'pie'
      trace.labels = x
      trace.values = y
      trace.textfont = { color: FONT_COLOR }
      trace.marker = { colors: TRACE_COLORS }
      break
    case 'heatmap':
      trace.type = 'heatmap'
      trace.x = x
      trace.y = y
      trace.z = z ?? dataset.rows.map((_, i) => i + 1)
      break
    case 'geomap':
      trace.type = 'scattergeo'
      trace.mode = 'markers'
      trace.lon = resolveValues(dataset, traceSpec.xAxis).map(toNumber)
      trace.lat = resolveValues(dataset, traceSpec.yAxis).map(toNumber)
      if (z) {
        trace.marker = { size: 8, color: z, colorscale: 'Viridis', showscale: true, colorbar: { title: { text: traceSpec.zAxis ? toAxisLabel(traceSpec.zAxis) : '', font: { color: FONT_COLOR } }, tickfont: { color: FONT_COLOR } } }
      } else {
        trace.marker = { size: 8, color }
      }
      break
  }

  if (traceSpec.transform) {
    trace.transforms = [{
      type: 'aggregate',
      groups: resolveValues(dataset, traceSpec.transform.groups).map(toDatum),
      aggregations: traceSpec.transform.aggregations
    }]
  }

  if (traceSpec.yaxis2) {
    trace.yaxis = traceSpec.yaxis2
  }

  return trace
}

const isGeomap = (chartType?: string) => chartType === 'geomap'
const isPie = (chartType?: string) => chartType === 'pie'

const buildLayout = (
  title: string,
  _traces: ResolvedTrace[],
  traceSpecs: TraceSpec[],
  xLabel?: string,
  yLabel?: string
): Partial<Plotly.Layout> => {
  const layout: Partial<Plotly.Layout> & Record<string, unknown> = { ...darkLayout(title) }

  const hasGeomap = traceSpecs.some(t => isGeomap(t.chartType))
  const hasPie = traceSpecs.some(t => isPie(t.chartType))

  if (!hasGeomap && !hasPie) {
    Object.assign(layout, darkAxes(xLabel, yLabel))
  }

  if (hasGeomap) {
    layout.geo = {
      showland: true,
      landcolor: 'rgb(17, 24, 39)',
      showocean: true,
      oceancolor: 'rgb(8, 12, 20)',
      showcountries: true,
      countrycolor: 'rgb(55, 65, 81)',
      showcoastlines: true,
      coastlinecolor: 'rgb(55, 65, 81)',
      projection: { type: 'natural earth' },
      showframe: false
    }
  }

  const barCount = traceSpecs.filter(t => t.chartType === 'bar').length
  if (barCount > 1) {
    layout.barmode = 'group'
  }

  const hasY2 = traceSpecs.some(t => t.yaxis2)
  if (hasY2) {
    layout.yaxis2 = {
      title: { text: 'Secondary', font: { color: FONT_COLOR } },
      side: 'right',
      overlaying: 'y',
      color: AXIS_COLOR,
      gridcolor: GRID_COLOR,
      zerolinecolor: GRID_COLOR
    }
  }

  return layout
}

const buildCustomChart = (spec: ChartSpec, title: string): PlotlySpec => {
  const layout = (spec.plotlyLayout as Partial<Plotly.Layout>) ?? {}
  return {
    data: (spec.plotlyData as Plotly.Data[]) ?? [],
    layout: {
      ...darkLayout(title),
      ...layout,
      title: layout.title ?? { text: title, font: { color: FONT_COLOR } }
    }
  }
}

export const buildPlotlySpec = (
  insight: InsightCandidate,
  dataset: GeneratedDataset
): PlotlySpec => {
  const spec = insight.chartSpec
  const title = insight.title

  if (!spec) {
    return { data: [], layout: { ...darkLayout(title) } }
  }

  if (spec.mode === 'custom') {
    return buildCustomChart(spec, title)
  }

  if (spec.traces && spec.traces.length > 0) {
    const traces = spec.traces.map((t, i) => buildTraceData(t, dataset, i))
    const layout = buildLayout(title, traces, spec.traces)
    return { data: traces as Plotly.Data[], layout }
  }

  const chartType = (spec.chartType ?? 'bar') as ChartType
  const singleTrace: TraceSpec = {
    chartType,
    xAxis: spec.xAxis ?? '',
    yAxis: spec.yAxis ?? '',
    zAxis: spec.zAxis ?? null,
    transform: null,
    yaxis2: null,
    name: null
  }
  const trace = buildTraceData(singleTrace, dataset, 0)
  const layout = buildLayout(title, [trace], [singleTrace], spec.xAxis, spec.yAxis)
  return { data: [trace as Plotly.Data], layout }
}
