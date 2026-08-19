import { z } from 'zod'

const fieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date', 'datetime'])

const semanticTypeSchema = z.enum([
  'identifier',
  'measure',
  'dimension',
  'timestamp',
  'currency',
  'percentage',
  'count',
  'text',
  'latitude',
  'longitude',
  'geohash'
])

export const datasetFieldSchema = z.object({
  name: z.string(),
  jsonPath: z.string().optional(),
  type: fieldTypeSchema,
  nullable: z.boolean(),
  semanticType: semanticTypeSchema.optional(),
  sampleValues: z.union([z.array(z.unknown()), z.string()]).optional(),
  unique: z.boolean().optional(),
  group: z.string().nullable().optional()
})

export const datasetSchemaSchema = z.object({
  source: z.string().min(1),
  fields: z.array(datasetFieldSchema),
  warnings: z.array(z.string())
})

const traceFilterSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in']),
  value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
})

const traceSpecSchema = z.object({
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'heatmap', 'geomap']),
  xAxis: z.string(),
  yAxis: z.string(),
  zAxis: z.string().nullable().optional(),
  aggregation: z.enum(['sum', 'mean', 'count', 'min', 'max', 'median', 'first', 'last']).nullable().optional(),
  filter: traceFilterSchema.nullable().optional(),
  yaxis2: z.string().nullable().optional(),
  name: z.string().nullable().optional()
})

export const chartSpecSchema = z.object({
  mode: z.enum(['recipe', 'custom']).default('recipe'),
  traces: z.array(traceSpecSchema).min(1).default([]),
  plotlyData: z.array(z.unknown()).nullable().optional(),
  plotlyLayout: z.record(z.string(), z.unknown()).nullable().optional()
})

const dataColumnSpecSchema = z.object({
  name: z.string(),
  generator: z.enum(['category', 'normal', 'uniform', 'linear', 'constant']),
  categories: z.array(z.string()).nullable().optional(),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  mean: z.number().nullable().optional(),
  stddev: z.number().nullable().optional(),
  start: z.number().nullable().optional(),
  end: z.number().nullable().optional(),
  step: z.number().nullable().optional(),
  value: z.unknown().nullable().optional()
})

export const dataProfileSchema = z.object({
  columns: z.array(dataColumnSpecSchema)
})

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
  hypothesis: z.string().min(1),
  metricDescription: z.string().default(''),
  chartSpec: chartSpecSchema,
  dataProfile: dataProfileSchema.nullable().default(null),
  assumptions: z.array(z.string()).default([]),
  description: z.string().nullable().optional()
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseDatasetSchema = (input: unknown) => datasetSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
