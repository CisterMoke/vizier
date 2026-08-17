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

const splitTopLevelCommas = (value: string): string[] => {
  const parts: string[] = []
  let depth = 0
  let segmentStart = 0

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]

    if (char === '(') {
      depth += 1
      continue
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (char === ',' && depth === 0) {
      parts.push(value.slice(segmentStart, index))
      segmentStart = index + 1
    }
  }

  parts.push(value.slice(segmentStart))
  return parts
}

const extractEntities = (rawText: string): Array<{ name: string; rawFields: string }> => {
  const entities: Array<{ name: string; rawFields: string }> = []
  let index = 0

  while (index < rawText.length) {
    const nameMatch = /[a-zA-Z_][\w]*/.exec(rawText.slice(index))

    if (!nameMatch) {
      break
    }

    const nameStart = index + nameMatch.index
    const nameEnd = nameStart + nameMatch[0].length
    let cursor = nameEnd

    while (cursor < rawText.length && /\s/.test(rawText[cursor])) {
      cursor += 1
    }

    if (rawText[cursor] !== '(') {
      index = nameEnd
      continue
    }

    let depth = 1
    let bodyCursor = cursor + 1

    while (bodyCursor < rawText.length && depth > 0) {
      const char = rawText[bodyCursor]

      if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth -= 1
      }

      bodyCursor += 1
    }

    if (depth !== 0) {
      break
    }

    entities.push({
      name: nameMatch[0],
      rawFields: rawText.slice(cursor + 1, bodyCursor - 1)
    })

    index = bodyCursor
  }

  return entities
}

const parseEntity = (entityName: string, rawFields: string): CanonicalEntity => {
  const fields = splitTopLevelCommas(rawFields)
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

  for (const entity of extractEntities(rawText)) {
    entities.push(parseEntity(entity.name, entity.rawFields))
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
