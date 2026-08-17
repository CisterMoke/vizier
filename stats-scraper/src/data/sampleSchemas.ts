import type { InsightCandidate } from '../domain/types'

export interface SampleSchema {
  id: string
  label: string
  rawSchema: string
}

export const SAMPLE_SCHEMAS: SampleSchema[] = [
  {
    id: 'retail-orders',
    label: 'Retail Orders',
    rawSchema: 'orders(id int, customer_id int, total decimal, created_at timestamp)'
  },
  {
    id: 'product-usage',
    label: 'Product Usage',
    rawSchema: 'events(id int, user_id int, event_name text, occurred_at timestamp)'
  }
]

export const FALLBACK_INSIGHTS: InsightCandidate[] = [
  {
    id: 'fallback-1',
    title: 'Revenue concentration by order tier',
    summary: 'Group order totals into low, medium, and high bands to identify concentration risk.',
    confidence: 0.73
  },
  {
    id: 'fallback-2',
    title: 'Trend in order volume over time',
    summary: 'Track order count by week to spot seasonality and abrupt demand shifts.',
    confidence: 0.78
  },
  {
    id: 'fallback-3',
    title: 'Customer contribution share',
    summary: 'Estimate what share of total value comes from top customer segments.',
    confidence: 0.69
  }
]
