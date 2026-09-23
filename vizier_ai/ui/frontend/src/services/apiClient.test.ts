import { extractErrorMessage, loadBundle } from './apiClient'
import type { CsvOptionsPayload } from '../domain/csv'

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
})
