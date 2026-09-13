import type { InsightCandidate } from '../domain/types'
import { parseInsightEnvelope } from '../domain/schemas'
import type { GenerateRequest } from '../components/DataInputPanel'

export interface GenerateResponse {
  sessionId: string
  insights: InsightCandidate[]
}

const DEFAULT_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

async function parseResponse(response: Response): Promise<GenerateResponse> {
  const raw = await response.json()

  return {
    sessionId: raw.sessionId ?? '',
    insights: parseInsightEnvelope(raw.insights).insights,
  }
}

export const callGenerate = async (request: GenerateRequest, backendUrl?: string): Promise<GenerateResponse> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  if (request.dataSource.mode === 'file' && request.dataSource.file) {
    const formData = new FormData()
    formData.append('schemaText', request.schemaText)
    formData.append('file', request.dataSource.file)
    formData.append('fileFormat', request.dataSource.fileFormat ?? 'csv')

    const response = await fetch(`${baseUrl}/api/generate-upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend error ${response.status}: ${errorText}`)
    }

    return parseResponse(response)
  }

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaText: request.schemaText,
      dataSourceMode: request.dataSource.mode,
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

  return parseResponse(response)
}

export const regenerate = async (sessionId: string, backendUrl?: string): Promise<InsightCandidate[]> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const response = await fetch(`${baseUrl}/api/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Backend error ${response.status}: ${errorText}`)
  }

  const raw = await response.json()
  return parseInsightEnvelope(raw.insights).insights
}

export interface TraceSpec {
  chartType: string
  xAxis: string
  yAxis: string
  zAxis?: string | null
  aggregation?: string | null
  filter?: { field: string; op: string; value: string | number | (string | number)[] } | null
  yaxis2?: string | null
  name?: string | null
}

export const editChart = async (
  sessionId: string,
  traces: TraceSpec[],
  backendUrl?: string
): Promise<{ plotlyData: unknown[]; plotlyLayout: Record<string, unknown> }> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const response = await fetch(`${baseUrl}/api/edit-chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, traces })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Backend error ${response.status}: ${errorText}`)
  }

  return await response.json()
}
