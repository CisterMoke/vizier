import { z } from 'zod'

export const insightCandidateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  keyIdea: z.string().min(1),
  metricDescription: z.string().default(''),
  assumptions: z.array(z.string()).default([]),
  plotlyData: z.array(z.unknown()).default([]),
  plotlyLayout: z.record(z.string(), z.unknown()).default({})
})

export const insightEnvelopeSchema = z.object({
  insights: z.array(insightCandidateSchema)
})

export const parseInsightEnvelope = (input: unknown) => insightEnvelopeSchema.parse(input)
