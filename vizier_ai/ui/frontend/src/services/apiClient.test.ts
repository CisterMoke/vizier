import { extractErrorMessage, insightSvgUrl, loadBundle, callGenerate, regenerate } from './apiClient'
import type { GenerationEvent } from './apiClient'
import type { CsvOptionsPayload } from '../domain/csv'
import type { GenerateRequest } from '../domain/types'

describe('extractErrorMessage', () => {
  it('extracts the detail from a JSON error body', () => {
    expect(extractErrorMessage(422, '{"detail": "No geographic fields in the schema"}')).toBe(
      'No geographic fields in the schema'
    )
  })

  it('falls back to status and raw text for non-JSON bodies', () => {
    expect(extractErrorMessage(500, 'Internal Server Error')).toBe('Backend error 500: Internal Server Error')
  })

  it('falls back when detail is not a string', () => {
    expect(extractErrorMessage(422, '{"detail": [{"msg": "bad"}]}')).toBe(
      'Backend error 422: {"detail": [{"msg": "bad"}]}'
    )
  })
})

describe('loadBundle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the bundle as multipart and extracts the bundle context', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 'session-7',
        insights: [],
        dataset_schema: { source: 's', fields: [] },
        data_profile: { columns: [] },
        warnings: []
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const bundleFile = new File(['{}'], 'bundle.json', { type: 'application/json' })
    const dataFile = new File(['[{"county": "King"}]'], 'data.csv', { type: 'text/csv' })

    const result = await loadBundle(bundleFile, dataFile, 'csv')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/load-bundle')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('bundle')).toBe(bundleFile)
    expect((init.body as FormData).get('data')).toBe(dataFile)
    expect((init.body as FormData).get('dataFormat')).toBe('csv')

    expect(result.sessionId).toBe('session-7')
    expect(result.context?.schema).toEqual({ source: 's', fields: [] })
    expect(result.context?.dataProfile).toEqual({ columns: [] })
  })

  it('omits the data file when none is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 's', insights: [], dataset_schema: null, data_profile: null })
    })
    vi.stubGlobal('fetch', fetchMock)

    await loadBundle(new File(['{}'], 'bundle.json'))

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('data')).toBeNull()
    expect(body.get('dataFormat')).toBe('csv')
  })

  it('sends csv options when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: 's', insights: [], dataset_schema: null, data_profile: null })
    })
    vi.stubGlobal('fetch', fetchMock)

    const dataFile = new File(['a;b'], 'data.csv', { type: 'text/csv' })
    await loadBundle(new File(['{}'], 'bundle.json'), dataFile, 'csv', { delimiter: ';' })

    const body = fetchMock.mock.calls[0][1].body as FormData
    expect(body.get('csvOptions')).toBe('{"delimiter":";"}')
  })

  it('builds the static insight svg url', () => {
    expect(insightSvgUrl('s1', 'i1')).toBe('http://localhost:8000/api/session/s1/insight/i1/svg')
  })
})

const ndjsonResponse = (lines: string[]) => ({
  ok: true,
  body: null,
  text: async () => lines.join('\n'),
})

describe('generation streaming', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const textRequest: GenerateRequest = {
    schemaText: 'orders',
    dataSource: { mode: 'none' },
  }

  it('feeds progress events to the handler and returns the complete payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      JSON.stringify({ type: 'prepare', rowCount: 2 }),
      JSON.stringify({ type: 'schema', fieldCount: 2, warnings: [] }),
      JSON.stringify({ type: 'insights', count: 1 }),
      JSON.stringify({ type: 'chart', index: 0, total: 1, insightId: 'i1', title: 'T' }),
      JSON.stringify({ type: 'complete', payload: { sessionId: 's1', insights: [] } }),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events: GenerationEvent[] = []
    const result = await callGenerate(textRequest, (event) => events.push(event))

    expect(events.map((e) => e.type)).toEqual(['prepare', 'schema', 'insights', 'chart'])
    expect(result.sessionId).toBe('s1')
  })

  it('throws the detail of an error event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      JSON.stringify({ type: 'error', detail: 'No geographic fields in the schema' }),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callGenerate(textRequest)).rejects.toThrow(
      'No geographic fields in the schema'
    )
  })

  it('rejects when the stream ends without a result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      JSON.stringify({ type: 'insights', count: 1 }),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(callGenerate(textRequest)).rejects.toThrow(/without a result/)
  })

  it('streams regenerate responses too', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ndjsonResponse([
      JSON.stringify({ type: 'insights', count: 2 }),
      JSON.stringify({ type: 'complete', payload: { sessionId: 's1', insights: [] } }),
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const events: GenerationEvent[] = []
    const result = await regenerate('s1', undefined, (event) => events.push(event))

    expect(events).toHaveLength(1)
    expect(result.sessionId).toBe('s1')
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/regenerate')
  })
})


class FakeXHR {
  static instances: FakeXHR[] = []
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null }
  onprogress: (() => void) | null = null
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 200
  responseText = ''
  open = vi.fn()
  send = vi.fn(() => {
    FakeXHR.instances.push(this)
  })
}

describe('file upload generation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeXHR.instances = []
  })

  const fileRequest: GenerateRequest = {
    schemaText: 'orders',
    dataSource: {
      mode: 'file',
      file: new File(['id,total\n1,2'], 'data.csv', { type: 'text/csv' }),
      fileFormat: 'csv',
    },
  }

  it('reports upload progress and streams the response events', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)

    const events: GenerationEvent[] = []
    const pending = callGenerate(fileRequest, (event) => events.push(event)).then(
      (result) => result,
      (error) => {
        throw error
      }
    )

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    const xhr = FakeXHR.instances[0]
    xhr.responseText = [
      JSON.stringify({ type: 'prepare', rowCount: 2 }),
      JSON.stringify({ type: 'complete', payload: { sessionId: 's-upload', insights: [] } }),
    ].join('\n')
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 })
    xhr.onload?.()

    const result = await pending
    expect(events.map((event) => event.type)).toEqual(['upload', 'prepare'])
    expect(events[0]).toMatchObject({ type: 'upload', fraction: 0.5 })
    expect(result.sessionId).toBe('s-upload')
  })

  it('dispatches pipeline events as download chunks arrive, before onload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)

    const events: GenerationEvent[] = []
    const pending = callGenerate(fileRequest, (event) => events.push(event)).then(
      (result) => result,
      (error) => {
        throw error
      }
    )

    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    const xhr = FakeXHR.instances[0]
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 })

    xhr.responseText = `${JSON.stringify({ type: 'prepare', rowCount: 294193 })}\n`
    xhr.onprogress?.()
    expect(events.map((event) => event.type)).toEqual(['upload', 'prepare'])

    xhr.responseText += `${JSON.stringify({ type: 'chart', index: 0, total: 7, insightId: 'i1', title: 'T1' })}\n`
    xhr.onprogress?.()
    expect(events.map((event) => event.type)).toEqual(['upload', 'prepare', 'chart'])

    xhr.responseText += `${JSON.stringify({ type: 'complete', payload: { sessionId: 's-stream', insights: [] } })}\n`
    xhr.onload?.()

    const result = await pending
    expect(result.sessionId).toBe('s-stream')
  })

  it('rejects with the backend detail when the upload fails', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)

    const pending = callGenerate(fileRequest)
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    const xhr = FakeXHR.instances[0]
    xhr.status = 422
    xhr.responseText = '{"detail": "Unsupported file format"}'
    xhr.onload?.()

    await expect(pending).rejects.toThrow('Unsupported file format')
  })
})
