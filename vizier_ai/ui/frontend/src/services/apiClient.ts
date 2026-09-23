import type { InsightCandidate, TraceSpec } from '../domain/types'
import { parseInsights } from '../domain/schemas'
import type { BundleContext } from '../domain/bundle'
import type { InsightConstraintsPayload } from '../domain/constraints'
import type { CsvOptionsPayload } from '../domain/csv'
import type { GenerateRequest } from '../components/DataInputPanel'

export interface GenerateResponse {
  sessionId: string
  insights: InsightCandidate[]
  context: BundleContext | null
  csvOptions?: CsvOptionsPayload | null
}

export interface ServerConfig {
  maxFileSize: number
  maxRows: number | null
}

const DEFAULT_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string) || 'http://localhost:8000'

export function extractErrorMessage(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed.detail === 'string') {
      return parsed.detail
    }
  } catch {
    return `Backend error ${status}: ${text}`
  }
  return `Backend error ${status}: ${text}`
}

export const fetchConfig = async (backendUrl?: string): Promise<ServerConfig> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const response = await fetch(`${baseUrl}/api/config`)

  if (!response.ok) {
    throw new Error(`Backend error ${response.status}: ${await response.text()}`)
  }

  const raw = await response.json()
  return {
    maxFileSize: raw.maxFileSize,
    maxRows: raw.maxRows ?? null,
  }
}

async function parseResponse(response: Response): Promise<GenerateResponse> {
  const raw = await response.json()

  const parsed = parseInsights(raw)

  return {
    sessionId: raw.sessionId ?? '',
    insights: parsed.insights,
    context: {
      schema: raw.dataset_schema ?? null,
      dataProfile: raw.data_profile ?? null
    },
    csvOptions: raw.csv_options ?? null
  }
}

export const callGenerate = async (request: GenerateRequest, backendUrl?: string): Promise<GenerateResponse> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  if (request.dataSource.mode === 'file' && request.dataSource.file) {
    const formData = new FormData()
    formData.append('schemaText', request.schemaText)
    formData.append('file', request.dataSource.file)
    formData.append('fileFormat', request.dataSource.fileFormat ?? 'csv')
    if (request.constraints) {
      formData.append('constraints', JSON.stringify(request.constraints))
    }
    if (request.csvOptions) {
      formData.append('csvOptions', JSON.stringify(request.csvOptions))
    }

    const response = await fetch(`${baseUrl}/api/generate-upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(extractErrorMessage(response.status, await response.text()))
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
      sqlQuery: request.dataSource.sql?.query,
      constraints: request.constraints
    })
  })

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, await response.text()))
  }

  return parseResponse(response)
}

export const regenerate = async (
  sessionId: string,
  constraints?: InsightConstraintsPayload,
  backendUrl?: string
): Promise<GenerateResponse> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const response = await fetch(`${baseUrl}/api/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, constraints })
  })

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, await response.text()))
  }

  return parseResponse(response)
}

export const loadBundle = async (
  bundle: File,
  data?: File,
  dataFormat: string = 'csv',
  csvOptions?: CsvOptionsPayload,
  backendUrl?: string
): Promise<GenerateResponse> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const formData = new FormData()
  formData.append('bundle', bundle)
  formData.append('dataFormat', dataFormat)
  if (data) {
    formData.append('data', data)
  }
  if (csvOptions) {
    formData.append('csvOptions', JSON.stringify(csvOptions))
  }

  const response = await fetch(`${baseUrl}/api/load-bundle`, {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, await response.text()))
  }

  return parseResponse(response)
}

export interface EditChartResult {
  plotlyData: unknown[] | null
  plotlyLayout: Record<string, unknown> | null
  isStatic: boolean
  staticSvg: string | null
}

export const editChart = async (
  sessionId: string,
  traces: TraceSpec[],
  backendUrl?: string
): Promise<EditChartResult> => {
  const baseUrl = backendUrl ?? DEFAULT_BACKEND_URL

  const response = await fetch(`${baseUrl}/api/edit-chart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, traces })
  })

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, await response.text()))
  }

  return await response.json()
}

export const insightSvgUrl = (sessionId: string, insightId: string): string =>
  `${DEFAULT_BACKEND_URL}/api/session/${sessionId}/insight/${insightId}/svg`
