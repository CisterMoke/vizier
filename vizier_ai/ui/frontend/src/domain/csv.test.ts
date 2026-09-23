import { buildCsvOptionsPayload, DEFAULT_CSV_OPTIONS, type CsvOptionsState } from './csv'

describe('buildCsvOptionsPayload', () => {
  it('returns undefined for defaults', () => {
    expect(buildCsvOptionsPayload(DEFAULT_CSV_OPTIONS)).toBeUndefined()
  })

  it('maps non-default options to the payload', () => {
    const state: CsvOptionsState = {
      ...DEFAULT_CSV_OPTIONS,
      delimiter: ';',
      header: false,
      skipRows: 2,
      encoding: 'latin-1',
      quoteChar: "'",
    }

    expect(buildCsvOptionsPayload(state)).toEqual({
      delimiter: ';',
      quote_char: "'",
      header: false,
      skip_rows: 2,
      encoding: 'latin-1',
    })
  })

  it('uses the custom delimiter when selected', () => {
    const state: CsvOptionsState = { ...DEFAULT_CSV_OPTIONS, delimiter: 'custom', customDelimiter: '|' }

    expect(buildCsvOptionsPayload(state)).toEqual({ delimiter: '|' })
  })

  it('falls back to default for an empty custom delimiter', () => {
    const state: CsvOptionsState = { ...DEFAULT_CSV_OPTIONS, delimiter: 'custom', customDelimiter: '  ' }

    expect(buildCsvOptionsPayload(state)).toBeUndefined()
  })

  it('omits zero skip rows', () => {
    const state: CsvOptionsState = { ...DEFAULT_CSV_OPTIONS, skipRows: 0 }

    expect(buildCsvOptionsPayload(state)).toBeUndefined()
  })
})
