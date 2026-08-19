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
  name: z.string().min(1),
  type: fieldTypeSchema,
  nullable: z.boolean(),
  semanticType: semanticTypeSchema.optional(),
  sampleValues: z.array(z.unknown()).optional(),
  unique: z.boolean().optional(),
  group: z.string().optional()
})

export const datasetSchemaSchema = z.object({
  source: z.string().min(1),
  fields: z.array(datasetFieldSchema),
  warnings: z.array(z.string())
})

export const chartSpecSchema = z.object({
  mode: z.enum(['recipe', 'custom']).default('recipe'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'heatmap']).optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  zAxis: z.string().optional(),
  plotlyData: z.array(z.unknown()).optional(),
  plotlyLayout: z.record(z.string(), z.unknown()).optional()
})

const dataColumnSpecSchema = z.object({
  name: z.string().min(1),
  generator: z.enum(['category', 'normal', 'uniform', 'linear', 'constant']),
  categories: z.array(z.string()).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  mean: z.number().optional(),
  stddev: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
  step: z.number().optional(),
  value: z.unknown().optional()
})

export const dataProfileSchema = z.object({
  rowCount: z.number().int().min(1).max(10000),
  columns: z.array(dataColumnSpecSchema)
})

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  hypothesis: z.string().min(1),
  metricDescription: z.string().min(1),
  chartSpec: chartSpecSchema,
  dataProfile: dataProfileSchema,
  assumptions: z.array(z.string())
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseDatasetSchema = (input: unknown) => datasetSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
