export interface CsvOptionsState {
  delimiter: string
  customDelimiter: string
  quoteChar: string
  header: boolean
  skipRows: number
  encoding: string
}

export const DEFAULT_CSV_OPTIONS: CsvOptionsState = {
  delimiter: ',',
  customDelimiter: '',
  quoteChar: '"',
  header: true,
  skipRows: 0,
  encoding: 'utf-8',
}

export interface CsvOptionsPayload {
  delimiter?: string
  quote_char?: string
  header?: boolean
  skip_rows?: number
  encoding?: string
}

export function buildCsvOptionsPayload(state: CsvOptionsState): CsvOptionsPayload | undefined {
  const payload: CsvOptionsPayload = {}

  const delimiter = state.delimiter === 'custom' ? state.customDelimiter.trim() : state.delimiter
  if (delimiter && delimiter !== ',') payload.delimiter = delimiter

  if (state.quoteChar && state.quoteChar !== '"') payload.quote_char = state.quoteChar
  if (!state.header) payload.header = false
  if (state.skipRows > 0) payload.skip_rows = state.skipRows
  if (state.encoding !== 'utf-8') payload.encoding = state.encoding

  return Object.keys(payload).length > 0 ? payload : undefined
}
