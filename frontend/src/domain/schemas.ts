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

export const chartSpecSchema = z.object({
  mode: z.enum(['recipe', 'custom']).default('recipe'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter', 'heatmap', 'geomap']).optional(),
  xAxis: z.string().optional(),
  yAxis: z.string().optional(),
  zAxis: z.string().nullable().optional(),
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
  rowCount: z.number().int().min(1).max(10000),
  columns: z.array(dataColumnSpecSchema)
})

export const insightCandidateSchema = z.object({
  id: z.string().default(''),
  title: z.string().default(''),
  summary: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
  hypothesis: z.string().default(''),
  metricDescription: z.string().default(''),
  chartSpec: chartSpecSchema.nullable().default(null),
  dataProfile: dataProfileSchema.nullable().default(null),
  assumptions: z.array(z.string()).default([]),
  description: z.string().nullable().optional()
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseDatasetSchema = (input: unknown) => datasetSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)

const fieldMappingSchema = z.object({
  insightId: z.string().min(1),
  mappings: z.record(z.string(), z.string())
})

export const fieldMappingResultSchema = z.object({
  mappings: z.array(fieldMappingSchema)
})

export const parseFieldMappingResult = (input: unknown) => fieldMappingResultSchema.parse(input)
