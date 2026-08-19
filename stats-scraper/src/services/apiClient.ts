import type { DatasetSchema, InsightCandidate, RawDataResult } from '../domain/types'
import { parseDatasetSchema, parseInsightEnvelope } from '../domain/schemas'
import type { GenerateRequest } from '../components/DataInputPanel'

export interface GenerateResponse {
  schema: DatasetSchema
  insights: InsightCandidate[]
  realData: RawDataResult | null
  fieldMappings: { insightId: string; mappings: Record<string, string> }[]
}

const DEFAULT_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

export const callGenerate = async (request: GenerateRequest, backendUrl?: string): Promise<GenerateResponse> => {
  const url = `${backendUrl ?? DEFAULT_BACKEND_URL}/api/generate`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaText: request.schemaText,
      dataSourceMode: request.dataSource.mode,
      fileContent: request.dataSource.fileContent,
      fileFormat: request.dataSource.fileFormat,
      restMethod: request.dataSource.rest?.method,
      restUrl: request.dataSource.rest?.url,
      restHeaders: request.dataSource.rest?.headers,
      restBody: request.dataSource.rest?.body,
      sqlConnection: request.dataSource.sql?.connectionString,
      sqlQuery: request.dataSource.sql?.query
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Backend error ${response.status}: ${errorText}`)
  }

  const raw = await response.json()

  return {
    schema: parseDatasetSchema(raw.schema),
    insights: parseInsightEnvelope(raw.insights).insights,
    realData: raw.realData ?? null,
    fieldMappings: raw.fieldMappings ?? []
  }
}
