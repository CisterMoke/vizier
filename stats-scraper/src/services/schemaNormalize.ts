import type { CanonicalEntity, CanonicalField, CanonicalFieldType, CanonicalSchema } from '../domain/types'

const TYPE_HINTS: Array<{ pattern: RegExp; type: CanonicalFieldType }> = [
  { pattern: /(timestamp|datetime)/i, type: 'datetime' },
  { pattern: /\bdate\b/i, type: 'date' },
  { pattern: /(int|decimal|numeric|float|double|real|number)/i, type: 'number' },
  { pattern: /(bool|boolean)/i, type: 'boolean' },
  { pattern: /(char|text|string|uuid|json)/i, type: 'string' }
]

const inferFieldType = (rawType: string): CanonicalFieldType => {
  for (const hint of TYPE_HINTS) {
    if (hint.pattern.test(rawType)) {
      return hint.type
    }
  }

  return 'unknown'
}

const parseField = (rawField: string): CanonicalField | null => {
  const trimmed = rawField.trim()

  if (!trimmed) {
    return null
  }

  const tokens = trimmed.split(/\s+/)

  if (tokens.length === 0) {
    return null
  }

  const [rawName, rawType = 'unknown', ...rest] = tokens

  return {
    name: rawName.replace(/[`"']/g, ''),
    type: inferFieldType(rawType),
    nullable: !/not\s+null/i.test(rest.join(' '))
  }
}

const parseEntity = (entityName: string, rawFields: string): CanonicalEntity => {
  const fields = rawFields
    .split(',')
    .map(parseField)
    .filter((field): field is CanonicalField => field !== null)

  return {
    name: entityName.trim(),
    fields
  }
}

export function normalizeSchema(rawText: string): CanonicalSchema {
  const entities: CanonicalEntity[] = []
  const warnings: string[] = []
  const entityRegex = /([a-zA-Z_][\w]*)\s*\(([^)]*)\)/g

  for (const match of rawText.matchAll(entityRegex)) {
    const [, entityName, rawFields] = match
    entities.push(parseEntity(entityName, rawFields))
  }

  if (entities.length === 0) {
    warnings.push('No entities could be extracted from the provided text.')
  }

  return {
    entities,
    relationships: [],
    warnings
  }
}
