import type {
  CanonicalEntity,
  CanonicalField,
  CanonicalFieldType,
  CanonicalRelationship,
  CanonicalSchema
} from './types'

type Schema<T> = {
  parse: (input: unknown) => T
}

const FIELD_TYPES: ReadonlySet<CanonicalFieldType> = new Set([
  'string',
  'number',
  'boolean',
  'date',
  'datetime',
  'unknown'
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asString = (value: unknown, path: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Expected string at ${path}`)
  }

  return value
}

const asBoolean = (value: unknown, path: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`)
  }

  return value
}

const asArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${path}`)
  }

  return value
}

const asFieldType = (value: unknown, path: string): CanonicalFieldType => {
  const parsed = asString(value, path)

  if (!FIELD_TYPES.has(parsed as CanonicalFieldType)) {
    throw new Error(`Expected valid field type at ${path}`)
  }

  return parsed as CanonicalFieldType
}

const parseCanonicalField = (value: unknown, path: string): CanonicalField => {
  if (!isRecord(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return {
    name: asString(value.name, `${path}.name`),
    type: asFieldType(value.type, `${path}.type`),
    nullable: asBoolean(value.nullable, `${path}.nullable`)
  }
}

const parseCanonicalEntity = (value: unknown, path: string): CanonicalEntity => {
  if (!isRecord(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return {
    name: asString(value.name, `${path}.name`),
    fields: asArray(value.fields, `${path}.fields`).map((field, index) =>
      parseCanonicalField(field, `${path}.fields[${index}]`)
    )
  }
}

const parseCanonicalRelationship = (value: unknown, path: string): CanonicalRelationship => {
  if (!isRecord(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return {
    fromEntity: asString(value.fromEntity, `${path}.fromEntity`),
    fromField: asString(value.fromField, `${path}.fromField`),
    toEntity: asString(value.toEntity, `${path}.toEntity`),
    toField: asString(value.toField, `${path}.toField`)
  }
}

export const CanonicalSchemaSchema: Schema<CanonicalSchema> = {
  parse: (input: unknown): CanonicalSchema => {
    if (!isRecord(input)) {
      throw new Error('Expected canonical schema object')
    }

    return {
      entities: asArray(input.entities, 'entities').map((entity, index) =>
        parseCanonicalEntity(entity, `entities[${index}]`)
      ),
      relationships: asArray(input.relationships, 'relationships').map((relationship, index) =>
        parseCanonicalRelationship(relationship, `relationships[${index}]`)
      ),
      warnings: asArray(input.warnings, 'warnings').map((warning, index) =>
        asString(warning, `warnings[${index}]`)
      )
    }
  }
}

export const parseCanonicalSchema = (input: unknown): CanonicalSchema =>
  CanonicalSchemaSchema.parse(input)
