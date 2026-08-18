import { z } from 'zod'

const fieldTypeSchema = z.enum(['string', 'number', 'boolean', 'date', 'datetime', 'unknown'])

export const canonicalFieldSchema = z.object({
  name: z.string().min(1),
  type: fieldTypeSchema,
  nullable: z.boolean()
})

export const canonicalEntitySchema = z.object({
  name: z.string().min(1),
  fields: z.array(canonicalFieldSchema)
})

export const canonicalRelationshipSchema = z.object({
  fromEntity: z.string().min(1),
  fromField: z.string().min(1),
  toEntity: z.string().min(1),
  toField: z.string().min(1)
})

export const canonicalSchemaSchema = z.object({
  entities: z.array(canonicalEntitySchema),
  relationships: z.array(canonicalRelationshipSchema),
  warnings: z.array(z.string())
})

const aggregationSchema = z.enum(['sum', 'count', 'avg', 'none'])

const chartRecipeSchema = z.object({
  mode: z.literal('recipe'),
  chartType: z.enum(['bar', 'line', 'pie', 'scatter']),
  xAxis: z.object({ column: z.string().min(1), aggregation: aggregationSchema }),
  yAxis: z.object({ column: z.string().min(1), aggregation: aggregationSchema }),
  groupBy: z.string().optional()
})

const chartCustomSchema = z.object({
  mode: z.literal('custom'),
  plotlyData: z.array(z.unknown()),
  plotlyLayout: z.record(z.string(), z.unknown())
})

export const chartSpecSchema = z.discriminatedUnion('mode', [chartRecipeSchema, chartCustomSchema])

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

export const parseCanonicalSchema = (input: unknown) => canonicalSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
