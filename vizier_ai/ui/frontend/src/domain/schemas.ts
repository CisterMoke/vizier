import { z } from 'zod'

export const traceSpecSchema = z.object({
  chart_type: z.string().min(1),
  x_axis: z.string().min(1),
  y_axis: z.string().min(1),
  z_axis: z.string().nullable().optional(),
  aggregation: z.string().nullable().optional(),
  filter: z.object({
    field: z.string(),
    op: z.string(),
    value: z.unknown(),
  }).nullable().optional(),
  name: z.string().nullable().optional(),
})

export const chartSpecSchema = z.object({
  traces: z.array(traceSpecSchema).default([]),
  plotlyData: z.array(z.unknown()).default([]),
  plotlyLayout: z.record(z.string(), z.unknown()).default({}),
})

export const insightMetadataSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyIdea: z.string().min(1),
  description: z.string().nullable().optional(),
})

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  metadata: insightMetadataSchema,
  chart_spec: chartSpecSchema,
  mock_seed: z.number().nullable().optional(),
})

export const insightsSchema = z.object({
  insights: z.array(insightCandidateSchema),
})

export const parseInsights = (input: unknown) => insightsSchema.parse(input)
