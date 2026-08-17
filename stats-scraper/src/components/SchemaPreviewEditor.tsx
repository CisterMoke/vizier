import { useEffect, useMemo, useState } from 'preact/hooks'
import { parseCanonicalSchema } from '../domain/schemas'
import type { CanonicalSchema } from '../domain/types'

interface SchemaPreviewEditorProps {
  schema: CanonicalSchema
  onChange: (schema: CanonicalSchema) => void
}

export function SchemaPreviewEditor({ schema, onChange }: SchemaPreviewEditorProps) {
  const [jsonError, setJsonError] = useState<string | null>(null)
  const serialized = useMemo(() => JSON.stringify(schema, null, 2), [schema])
  const [draft, setDraft] = useState(serialized)

  useEffect(() => {
    setDraft(serialized)
  }, [serialized])

  const handleInput = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value
    setDraft(value)

    try {
      const parsed = parseCanonicalSchema(JSON.parse(value))
      setJsonError(null)
      onChange(parsed)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'Invalid schema JSON')
    }
  }

  return (
    <section>
      <h2>Schema Preview</h2>
      <label for="canonical-schema-json">Canonical schema JSON</label>
      <textarea id="canonical-schema-json" rows={16} value={draft} onInput={handleInput} />
      {jsonError ? <p role="alert">{jsonError}</p> : null}
    </section>
  )
}
