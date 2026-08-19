import type { DataFormat, RawDataResult } from '../domain/types'

const detectFormat = (text: string): DataFormat => {
  const trimmed = text.trim()
  if (!trimmed) return 'unknown'

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    if (trimmed.includes('\n') && trimmed.split('\n').every((line, i) => line.trim().startsWith('{') || i === 0)) {
      return 'jsonl'
    }
    return 'json'
  }

  const firstLine = trimmed.split('\n')[0] ?? ''
  if (firstLine.includes(',')) {
    return 'csv'
  }

  return 'unknown'
}

const parseCSV = (text: string): RawDataResult => {
  const lines = text.trim().split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return { format: 'csv', columns: [], rows: [], rowCount: 0 }
  }

  const parseLine = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    return values
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line)
    const row: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      const raw = values[index] ?? ''
      const num = Number(raw)
      row[header] = !isNaN(num) && raw !== '' ? num : raw
    })
    return row
  })

  return { format: 'csv', columns: headers, rows, rowCount: rows.length }
}

const parseJSON = (text: string): RawDataResult => {
  const parsed = JSON.parse(text)
  const arr = Array.isArray(parsed) ? parsed : [parsed]

  if (arr.length === 0) {
    return { format: 'json', columns: [], rows: [], rowCount: 0 }
  }

  const flatten = (obj: Record<string, unknown>, prefix = ''): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flatten(value as Record<string, unknown>, fullKey))
      } else {
        result[fullKey] = value
      }
    }
    return result
  }

  const flatRows = arr.map((item) => flatten(item as Record<string, unknown>))
  const columns = [...new Set(flatRows.flatMap((row) => Object.keys(row)))]

  return { format: 'json', columns, rows: flatRows, rowCount: flatRows.length }
}

const parseJSONL = (text: string): RawDataResult => {
  const lines = text.trim().split('\n').filter((line) => line.trim().length > 0)
  const rows = lines.map((line) => JSON.parse(line))

  if (rows.length === 0) {
    return { format: 'jsonl', columns: [], rows: [], rowCount: 0 }
  }

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]

  return { format: 'jsonl', columns, rows, rowCount: rows.length }
}

export const parseRawData = (text: string): RawDataResult => {
  const format = detectFormat(text)

  switch (format) {
    case 'csv':
      return parseCSV(text)
    case 'json':
      try {
        return parseJSON(text)
      } catch {
        return { format: 'unknown', columns: [], rows: [], rowCount: 0 }
      }
    case 'jsonl':
      try {
        return parseJSONL(text)
      } catch {
        return { format: 'unknown', columns: [], rows: [], rowCount: 0 }
      }
    default:
      return { format: 'unknown', columns: [], rows: [], rowCount: 0 }
  }
}

export const buildDatasetFromRaw = (
  insightId: string,
  rawData: RawDataResult
): import('../domain/types').GeneratedDataset => {
  return {
    id: `dataset-${insightId}-real`,
    name: `Real data (${rawData.rowCount} rows)`,
    columns: rawData.columns,
    rows: rawData.rows
  }
}
