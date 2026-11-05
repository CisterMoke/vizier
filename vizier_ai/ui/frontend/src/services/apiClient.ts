import type { GenerateRequest, InsightCandidate, TraceSpec } from '../domain/types'
import { parseInsights } from '../domain/schemas'
import type { BundleContext } from '../domain/bundle'
import type { InsightConstraintsPayload } from '../domain/constraints'
import type { CsvOptionsPayload } from '../domain/csv'
import type { ExcelOptionsPayload } from '../domain/excel'

export interface GenerateResponse {
  sessionId: string
  insights: InsightCandidate[]
  context: BundleContext | null
  csvOptions?: CsvOptionsPayload | null
  excelOptions?: ExcelOptionsPayload | null
}

export interface ServerConfig {
  maxFileSize: number
  maxRows: number | null
}

export type GenerationEvent =
  | { type: 'upload'; fraction: number }
  | { type: 'prepare'; rowCount: number }
  | { type: 'schema'; fieldCount: number; warnings: string[] }
  | { type: 'insights'; count: number }
  | { type: 'chart'; index: number; total: number; insightId: string; title: string }

export type ProgressHandler = (event: GenerationEvent) => void

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

function buildGenerateResponse(raw: Record<string, unknown>): GenerateResponse {
  const parsed = parseInsights(raw)

  return {
    sessionId: (raw.sessionId as string) ?? '',
    insights: parsed.insights,
    context: {
      schema: (raw.dataset_schema as BundleContext['schema']) ?? null,
      dataProfile: (raw.data_profile as BundleContext['dataProfile']) ?? null
    },
    csvOptions: (raw.csv_options as CsvOptionsPayload) ?? null,
    excelOptions: (raw.excel_options as ExcelOptionsPayload) ?? null
  }
}

async function parseResponse(response: Response): Promise<GenerateResponse> {
  return buildGenerateResponse(await response.json())
}

const processGenerationLine = (
  line: string,
  onProgress?: ProgressHandler
): Record<string, unknown> | null => {
  const event = JSON.parse(line) as { type: string; payload?: unknown; detail?: unknown }
  if (event.type === 'complete') {
    return event.payload as Record<string, unknown>
  }
  if (event.type === 'error') {
    throw new Error(
      typeof event.detail === 'string' ? event.detail : 'Generation failed.'
    )
  }
  onProgress?.(event as GenerationEvent)
  return null
}

const processGenerationText = (
  text: string,
  onProgress?: ProgressHandler
): Record<string, unknown> | null => {
  let payload: Record<string, unknown> | null = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const result = processGenerationLine(line, onProgress)
    if (result) payload = result
  }
  return payload
}

const parseGenerationPayload = (payload: Record<string, unknown> | null): GenerateResponse => {
  if (!payload) {
    throw new Error('The generation stream ended without a result.')
  }
  return buildGenerateResponse(payload)
}

/** Uploads the form via XHR — the only browser API that reports upload
 * progress — emitting `upload` events (0..1) through onProgress as the
 * bytes leave. The NDJSON response body streams back on the same request,
 * so pipeline events are consumed from xhr.responseText as download
 * chunks arrive (not buffered until onload) and each complete line is
 * handed to onProgress immediately; resolves with the complete payload. */
const uploadForGeneration = (
  url: string,
  formData: FormData,
  onProgress?: ProgressHandler
): Promise<Record<string, unknown> | null> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    let consumed = 0
    let tail = ''
    let payload: Record<string, unknown> | null = null

    const consume = (): void => {
      // before headers arrive xhr.status is 0; a non-2xx body (JSON error,
      // not NDJSON) must not be dispatched as progress events
      if (xhr.status !== 0 && (xhr.status < 200 || xhr.status >= 300)) return
      tail += xhr.responseText.slice(consumed)
      consumed = xhr.responseText.length
      const lines = tail.split('\n')
      tail = lines.pop() ?? ''
      const chunkPayload = processGenerationText(lines.join('\n'), onProgress)
      if (chunkPayload) payload = chunkPayload
    }

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable && event.total > 0) {
        onProgress({ type: 'upload', fraction: Math.min(event.loaded / event.total, 1) })
      }
    }
    xhr.onprogress = () => {
      try {
        consume()
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => reject(new Error('The upload request failed.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          consume()
          if (tail.trim()) {
            const tailPayload = processGenerationText(tail, onProgress)
            if (tailPayload) payload = tailPayload
          }
          resolve(payload)
        } catch (error) {
          reject(error)
        }
      } else {
        reject(new Error(extractErrorMessage(xhr.status, xhr.responseText)))
      }
    }
    xhr.send(formData)
  })

/**
 * Read an NDJSON generation stream: progress events are handed to
 * onProgress as they arrive; the final complete event becomes the
 * response payload. Falls back to buffered reading when the environment
 * exposes no response body stream.
 */
async function readGenerationStream(
  response: Response,
  onProgress?: ProgressHandler
): Promise<GenerateResponse> {
  let payload: Record<string, unknown> | null = null

  if (response.body) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      const chunkPayload = processGenerationText(lines.join('\n'), onProgress)
      if (chunkPayload) payload = chunkPayload
    }
    if (buffer.trim()) {
      const tailPayload = processGenerationText(buffer, onProgress)
      if (tailPayload) payload = tailPayload
    }
  } else {
    payload = processGenerationText(await response.text(), onProgress)
  }

  return parseGenerationPayload(payload)
}

export const callGenerate = async (
  request: GenerateRequest,
  onProgress?: ProgressHandler,
  backendUrl?: string
): Promise<GenerateResponse> => {
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
    if (request.excelOptions) {
      formData.append('excelOptions', JSON.stringify(request.excelOptions))
    }

    const payload = await uploadForGeneration(
      `${baseUrl}/api/generate-upload`,
      formData,
      onProgress
    )
    return parseGenerationPayload(payload)
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

  return readGenerationStream(response, onProgress)
}

export const regenerate = async (
  sessionId: string,
  constraints?: InsightConstraintsPayload,
  onProgress?: ProgressHandler,
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

  return readGenerationStream(response, onProgress)
}

export const loadBundle = async (
  bundle: File,
  data?: File,
  dataFormat: string = 'csv',
  csvOptions?: CsvOptionsPayload,
  excelOptions?: ExcelOptionsPayload,
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
  if (excelOptions) {
    formData.append('excelOptions', JSON.stringify(excelOptions))
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
