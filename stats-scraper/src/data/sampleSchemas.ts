import type { InsightCandidate } from '../domain/types'

export interface SampleSchema {
  id: string
  label: string
  rawSchema: string
}

export const SAMPLE_SCHEMAS: SampleSchema[] = [
  {
    id: 'retail-orders',
    label: 'Retail Orders (SQL)',
    rawSchema: 'orders(id int, customer_id int, total decimal, status varchar, created_at timestamp)'
  },
  {
    id: 'product-usage',
    label: 'Product Usage (CSV)',
    rawSchema: 'event_id,user_id,event_name,session_duration,timestamp\ne1,u1,page_view,120,2024-01-01T10:00:00Z'
  },
  {
    id: 'api-resource',
    label: 'OpenAPI: /orders',
    rawSchema: 'GET /orders -> { id: string, customer: { name: string, segment: string }, total: number, items: [{ sku: string, qty: number, price: number }] }'
  }
]

export const FALLBACK_INSIGHTS: InsightCandidate[] = [
  {
    id: 'fallback-1',
    title: 'Revenue concentration by order tier',
    summary: 'Group order totals into low, medium, and high bands to identify concentration risk.',
    confidence: 0.73,
    hypothesis: 'A small set of order tiers contributes most of total revenue.',
    metricDescription: 'Total revenue and order count grouped by order value tier.',
    chartSpec: {
      mode: 'recipe',
      chartType: 'bar',
      xAxis: { column: 'tier', aggregation: 'none' },
      yAxis: { column: 'revenue', aggregation: 'sum' }
    },
    dataProfile: {
      rowCount: 100,
      columns: [
        { name: 'tier', generator: 'category', categories: ['Low', 'Medium', 'High', 'Premium'] },
        { name: 'revenue', generator: 'normal', mean: 500, stddev: 200, min: 0, max: 2000 }
      ]
    },
    assumptions: ['Order totals are numeric and non-null for most rows.']
  },
  {
    id: 'fallback-2',
    title: 'Trend in order volume over time',
    summary: 'Track order count by week to spot seasonality and abrupt demand shifts.',
    confidence: 0.78,
    hypothesis: 'Order volume varies by week with visible seasonality.',
    metricDescription: 'Weekly order count over the most recent periods.',
    chartSpec: {
      mode: 'recipe',
      chartType: 'line',
      xAxis: { column: 'week', aggregation: 'none' },
      yAxis: { column: 'order_count', aggregation: 'none' }
    },
    dataProfile: {
      rowCount: 52,
      columns: [
        { name: 'week', generator: 'linear', start: 1, end: 52, step: 1 },
        { name: 'order_count', generator: 'normal', mean: 300, stddev: 80, min: 50, max: 600 }
      ]
    },
    assumptions: ['Event timestamps are complete and correctly formatted.']
  },
  {
    id: 'fallback-3',
    title: 'Customer contribution share',
    summary: 'Estimate what share of total value comes from top customer segments.',
    confidence: 0.69,
    hypothesis: 'Top customer segments account for a disproportionate revenue share.',
    metricDescription: 'Percentage of total revenue by customer segment bucket.',
    chartSpec: {
      mode: 'recipe',
      chartType: 'pie',
      xAxis: { column: 'segment', aggregation: 'none' },
      yAxis: { column: 'revenue', aggregation: 'sum' }
    },
    dataProfile: {
      rowCount: 5,
      columns: [
        { name: 'segment', generator: 'category', categories: ['Enterprise', 'SMB', 'Startup', 'Individual', 'Retail'] },
        { name: 'revenue', generator: 'uniform', min: 1000, max: 50000 }
      ]
    },
    assumptions: ['Customer identifiers can be grouped into stable segments.']
  }
]
