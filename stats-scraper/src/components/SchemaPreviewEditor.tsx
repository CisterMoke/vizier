import { Alert, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
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
    setJsonError(null)
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
    <Paper withBorder radius="lg" p="lg" className="bg-white/80 backdrop-blur-sm shadow-sm">
      <Stack gap="md">
        <div>
          <Title order={3}>Canonical Schema</Title>
          <Text c="dimmed" size="sm">
            Review and edit normalized JSON directly.
          </Text>
        </div>

        <Textarea
          id="canonical-schema-json"
          label="Canonical schema JSON"
          minRows={14}
          autosize
          value={draft}
          onInput={handleInput}
          className="font-mono"
        />

        {jsonError ? <Alert color="red" role="alert">{jsonError}</Alert> : null}
      </Stack>
    </Paper>
  )
}
