import { buildPlotlySpec } from './chartSpec'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import type * as Plotly from 'plotly.js'

const mockDataset: GeneratedDataset = {
  id: 'dataset-1',
  name: 'Revenue sample',
  columns: ['category', 'revenue'],
  rows: [
    { category: 'A', revenue: 120 },
    { category: 'A', revenue: 80 },
    { category: 'B', revenue: 95 }
  ]
}

const mockBarInsight: InsightCandidate = {
  id: 'ins-1',
  title: 'Revenue by category',
  summary: 'Show revenue by category as a bar chart.',
  confidence: 0.91,
  hypothesis: 'Revenue varies by category.',
  metricDescription: 'Sum of revenue grouped by category.',
  chartSpec: {
    mode: 'recipe',
    chartType: 'bar',
    xAxis: '$.category',
    yAxis: '$.revenue'
  },
  dataProfile: {
    rowCount: 4,
    columns: [
      { name: '$.category', generator: 'category', categories: ['A', 'B', 'C', 'D'] },
      { name: '$.revenue', generator: 'uniform', min: 100, max: 500 }
    ]
  },
  assumptions: ['Category and revenue columns are present.']
}

it('maps bar chart recipe to a bar trace', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('bar')
})

it('resolves JSONPath axes from dataset rows', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  const trace = spec.data[0] as Plotly.Data
  expect(trace.x).toEqual(['A', 'A', 'B'])
  expect(trace.y).toEqual([120, 80, 95])
})

it('maps line chart recipe to a scatter trace with lines+markers', () => {
  const lineInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'line', xAxis: '$.week', yAxis: '$.count' }
  }
  const spec = buildPlotlySpec(lineInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('scatter')
  expect((spec.data[0] as Plotly.Data).mode).toBe('lines+markers')
})

it('maps pie chart recipe to a pie trace', () => {
  const pieInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'pie', xAxis: '$.segment', yAxis: '$.share' }
  }
  const spec = buildPlotlySpec(pieInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('pie')
})

it('maps scatter chart recipe to a scatter trace with markers only', () => {
  const scatterInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'scatter', xAxis: '$.orders', yAxis: '$.revenue' }
  }
  const spec = buildPlotlySpec(scatterInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('scatter')
  expect((spec.data[0] as Plotly.Data).mode).toBe('markers')
})

it('maps heatmap chart recipe to a heatmap trace', () => {
  const heatmapInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'heatmap', xAxis: '$.longitude', yAxis: '$.latitude', zAxis: '$.intensity' }
  }
  const heatmapDataset: GeneratedDataset = {
    ...mockDataset,
    columns: ['longitude', 'latitude', 'intensity'],
    rows: [
      { longitude: -74.0, latitude: 40.7, intensity: 10 },
      { longitude: -73.9, latitude: 40.8, intensity: 25 }
    ]
  }
  const spec = buildPlotlySpec(heatmapInsight, heatmapDataset)
  expect(spec.data[0]?.type).toBe('heatmap')
})

it('maps geomap chart recipe to a scattergeo trace on a world map', () => {
  const geomapInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: { mode: 'recipe', chartType: 'geomap', xAxis: '$.lng', yAxis: '$.lat', zAxis: '$.score' }
  }
  const geoDataset: GeneratedDataset = {
    ...mockDataset,
    columns: ['lng', 'lat', 'score'],
    rows: [
      { lng: -74.0, lat: 40.7, score: 4.5 },
      { lng: -118.2, lat: 34.0, score: 4.8 }
    ]
  }
  const spec = buildPlotlySpec(geomapInsight, geoDataset)
  expect(spec.data[0]?.type).toBe('scattergeo')
  expect((spec.layout as { geo: { projection: { type: string } } }).geo.projection.type).toBe('natural earth')
})

it('passes through custom plotly spec directly', () => {
  const customInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'custom',
      plotlyData: [{ type: 'heatmap', z: [[1, 2], [3, 4]] }],
      plotlyLayout: { title: { text: 'Custom Heatmap' } }
    }
  }
  const spec = buildPlotlySpec(customInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('heatmap')
  expect((spec.layout as { title: { text: string } }).title.text).toBe('Custom Heatmap')
})

it('works when mode is omitted (defaults to recipe)', () => {
  const noModeInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      chartType: 'bar',
      xAxis: '$.category',
      yAxis: '$.revenue'
    } as InsightCandidate['chartSpec']
  }
  const spec = buildPlotlySpec(noModeInsight, mockDataset)
  expect(spec.data[0]?.type).toBe('bar')
})

it('returns the required plotly contract shape', () => {
  const spec = buildPlotlySpec(mockBarInsight, mockDataset)
  expectTypeOf(spec).toMatchTypeOf<{
    data: Plotly.Data[]
    layout: Partial<Plotly.Layout>
  }>()
})

it('builds multiple traces from traces array', () => {
  const multiTraceInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        {
          chartType: 'bar',
          xAxis: '$.category',
          yAxis: '$.revenue',
          name: 'Revenue'
        },
        {
          chartType: 'line',
          xAxis: '$.category',
          yAxis: '$.revenue',
          yaxis2: 'y2',
          name: 'Trend'
        }
      ]
    }
  }
  const spec = buildPlotlySpec(multiTraceInsight, mockDataset)
  expect(spec.data).toHaveLength(2)
  expect(spec.data[0]?.type).toBe('bar')
  expect(spec.data[1]?.type).toBe('scatter')
  expect((spec.data[1] as Plotly.Data).yaxis).toBe('y2')
})

it('embeds aggregate transform in trace data', () => {
  const aggInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      chartType: 'bar',
      xAxis: '$.category',
      yAxis: '$.revenue',
      traces: [
        {
          chartType: 'bar',
          xAxis: '$.category',
          yAxis: '$.revenue',
          transform: {
            type: 'aggregate',
            groups: '$.category',
            aggregations: [{ func: 'sum', target: 'y' }]
          }
        }
      ]
    }
  }
  const spec = buildPlotlySpec(aggInsight, mockDataset)
  const trace = spec.data[0] as Plotly.Data & { transforms?: unknown[] }
  expect(trace.transforms).toBeDefined()
  expect((trace.transforms as [{ type: string }])[0].type).toBe('aggregate')
})

it('sets barmode group when multiple bar traces exist', () => {
  const multiBarInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'A' },
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'B' }
      ]
    }
  }
  const spec = buildPlotlySpec(multiBarInsight, mockDataset)
  expect((spec.layout as { barmode?: string }).barmode).toBe('group')
})

it('adds yaxis2 layout when a trace uses yaxis2', () => {
  const overlayInsight: InsightCandidate = {
    ...mockBarInsight,
    chartSpec: {
      mode: 'recipe',
      traces: [
        { chartType: 'bar', xAxis: '$.category', yAxis: '$.revenue', name: 'Bars' },
        { chartType: 'line', xAxis: '$.category', yAxis: '$.revenue', yaxis2: 'y2', name: 'Line' }
      ]
    }
  }
  const spec = buildPlotlySpec(overlayInsight, mockDataset)
  const layout = spec.layout as { yaxis2?: { side: string; overlaying: string } }
  expect(layout.yaxis2).toBeDefined()
  expect(layout.yaxis2!.side).toBe('right')
  expect(layout.yaxis2!.overlaying).toBe('y')
})
