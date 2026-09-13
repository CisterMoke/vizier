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

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  keyIdea: z.string().min(1),
  metricDescription: z.string().default(''),
  assumptions: z.array(z.string()).default([]),
  plotlyData: z.array(z.unknown()).default([]),
  plotlyLayout: z.record(z.string(), z.unknown()).default({}),
  description: z.string().nullable().optional()
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseDatasetSchema = (input: unknown) => datasetSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
