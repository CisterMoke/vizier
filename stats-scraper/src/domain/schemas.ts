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

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  confidence: z.number().min(0).max(1),
  hypothesis: z.string().min(1),
  metricDescription: z.string().min(1),
  chartRecommendation: z.enum(['bar', 'line', 'pie', 'scatter', 'table']),
  assumptions: z.array(z.string())
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseCanonicalSchema = (input: unknown) => canonicalSchemaSchema.parse(input)
export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
