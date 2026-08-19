import { JSONPath } from 'jsonpath-plus'
import type { GeneratedDataset } from '../domain/types'

export const resolveValues = (dataset: GeneratedDataset, jsonPath: string): unknown[] => {
  return dataset.rows.map((row) => {
    const path = jsonPath.startsWith('$') ? jsonPath : `$.${jsonPath}`
    const result = JSONPath({ path, json: row })
    return result.length > 0 ? result[0] : null
  })
}
