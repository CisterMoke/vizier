import { generateText, Output, NoObjectGeneratedError } from 'ai'
import { createGoogle } from '@ai-sdk/google'
import { createMistral } from '@ai-sdk/mistral'
import { datasetSchemaSchema, insightEnvelopeSchema, parseDatasetSchema, parseInsightEnvelope } from '../domain/schemas'
import type { DatasetSchema, InsightCandidate } from '../domain/types'

export type ProviderId = 'google' | 'mistral'

export interface InsightPromptInput {
  schema: DatasetSchema
  maxIdeas: number
}

export interface LLMProviderConfig {
  apiKey: string
  provider: ProviderId
  model: string
}

export interface LLMProvider {
  mapSchema: (rawText: string) => Promise<DatasetSchema>
  generateInsights: (input: InsightPromptInput) => Promise<InsightCandidate[]>
}

const MAP_SCHEMA_PROMPT = `You are a data schema analyzer. Given free-form text (SQL DDL, CSV headers, JSON, OpenAPI spec, scraped HTML, or any data description), extract a flat list of fields with their types and semantics.

For each field, infer:
- type: string, number, boolean, date, or datetime
- semanticType: identifier (primary key), measure (numeric metric), dimension (categorical label), timestamp, currency, percentage, count, text, latitude (lat/geo lat), longitude (lng/geo lon), or geohash
- sampleValues: 3-5 representative values if they can be inferred from the input
- unique: true if the field is a primary key or unique identifier
- group: a grouping label if the fields come from distinct nested objects or resources (e.g. "order", "customer")

Set the source to a short description of where the data comes from (e.g. "SQL: orders table", "CSV: sales_data", "OpenAPI: /orders endpoint").
Include warnings for any fields you are uncertain about.`

const INSIGHT_PROMPT = `You are an analytics brainstorming assistant. Given a dataset schema with field semantics and sample values, generate creative analytics hypotheses suitable for a hackathon demo.

For each insight, provide a chartSpec object that MUST include "mode": "recipe" as a field. Example:
  "chartSpec": { "mode": "recipe", "chartType": "bar", "xAxis": "category", "yAxis": "revenue" }
- chartType can be: bar, line, pie, scatter, heatmap, or geomap.
  - Use "geomap" when the data has geographic coordinates (latitude/longitude fields). Provide xAxis as the longitude column, yAxis as the latitude column, and optionally zAxis as the intensity/value column. This renders points on a world map.
  - Use "heatmap" for 2D density/intensity views when you need a grid-based heatmap (not geographic). Provide xAxis, yAxis, and zAxis for intensity.
  - Use "scatter" for correlation between two measures.
  - Use "bar" for categorical comparisons.
  - Use "line" for trends over time.
  - Use "pie" for share/proportion.
- xAxis and yAxis must be column name strings from the schema.
- zAxis is optional, for heatmap intensity or geomap point coloring.

Provide a dataProfile with rowCount and columns. Each column must have a "generator" field:
  - "category": include "categories" array (e.g. ["Electronics", "Clothing", "Home"])
  - "normal": include "mean" and "stddev", optionally "min" and "max"
  - "uniform": include "min" and "max"
  - "linear": include "start", "end", and "step"
  - "constant": include "value"
  For geographic coordinates, use "uniform" with min/max for latitude (-90 to 90) and longitude (-180 to 180).
Column names in dataProfile must match chartSpec xAxis/yAxis/zAxis values.
Do not include fields in column specs beyond what each generator needs.
Use the field semanticType and sampleValues to make realistic choices.
Return practical, visually interesting ideas with concise reasoning.`

const createModel = (config: LLMProviderConfig) => {
  if (config.provider === 'google') {
    const provider = createGoogle({ apiKey: config.apiKey })
    return provider(config.model)
  }

  if (config.provider === 'mistral') {
    const provider = createMistral({ apiKey: config.apiKey })
    return provider(config.model)
  }

  throw new Error(`Unsupported provider: ${config.provider}`)
}

const safeGenerate = async <T,>(
  fn: () => Promise<{ output: T }>,
  fallbackFn: () => Promise<{ output: T }>,
  context: string
): Promise<T> => {
  try {
    const result = await fn()
    return result.output
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error(`[${context}] No object generated. Cause:`, error.cause)
      console.error(`[${context}] Raw text:`, error.text?.slice(0, 500))
    }
    try {
      const retryResult = await fallbackFn()
      return retryResult.output
    } catch (retryError) {
      if (NoObjectGeneratedError.isInstance(retryError)) {
        console.error(`[${context}] Retry also failed. Cause:`, retryError.cause)
      }
      throw retryError
    }
  }
}

export const createLLMProvider = (config: LLMProviderConfig): LLMProvider => {
  return {
    mapSchema: async (rawText: string): Promise<DatasetSchema> => {
      const model = createModel(config)
      const output = await safeGenerate(
        () => generateText({
          model,
          output: Output.object({ schema: datasetSchemaSchema }),
          system: MAP_SCHEMA_PROMPT,
          prompt: `Analyze this data description and extract the dataset schema:\n\n${rawText}`
        }),
        () => generateText({
          model,
          output: Output.object({ schema: datasetSchemaSchema }),
          system: MAP_SCHEMA_PROMPT,
          prompt: `Extract the fields from this data. Return JSON with source, fields (each with name, type, nullable), and warnings:\n\n${rawText}`
        }),
        'schema-mapping'
      )

      return parseDatasetSchema(output)
    },
    generateInsights: async (input: InsightPromptInput): Promise<InsightCandidate[]> => {
      const model = createModel(config)
      const output = await safeGenerate(
        () => generateText({
          model,
          output: Output.object({ schema: insightEnvelopeSchema }),
          system: INSIGHT_PROMPT,
          prompt: `Given this dataset schema, produce up to ${input.maxIdeas} insight candidates:\n\n${JSON.stringify(input.schema)}`
        }),
        () => generateText({
          model,
          output: Output.object({ schema: insightEnvelopeSchema }),
          system: `${INSIGHT_PROMPT}\n\nIMPORTANT: Make sure every chartSpec uses mode "recipe". Make sure every dataProfile column has a valid generator. Make sure column names match between chartSpec and dataProfile.`,
          prompt: `Generate ${input.maxIdeas} insights for this schema. Each insight needs: id, title, summary, confidence, hypothesis, metricDescription, chartSpec (mode "recipe", chartType, xAxis, yAxis), dataProfile (rowCount, columns with generators), assumptions.\n\nSchema: ${JSON.stringify(input.schema)}`
        }),
        'insight-generation'
      )

      return parseInsightEnvelope(output).insights
    }
  }
}
