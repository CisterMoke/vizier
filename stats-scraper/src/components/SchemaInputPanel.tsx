import { Button, Checkbox, Group, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { useState } from 'preact/hooks'
import type { SampleSchema } from '../data/sampleSchemas'

interface SchemaInputPanelProps {
  onMapSchema: (rawText: string) => Promise<void>
  isMapping: boolean
  sampleSchemas?: SampleSchema[]
}

export function SchemaInputPanel({ onMapSchema, isMapping, sampleSchemas = [] }: SchemaInputPanelProps) {
  const [rawText, setRawText] = useState('orders(id int, total decimal, created_at timestamp)')
  const [selectedSamples, setSelectedSamples] = useState<Record<string, boolean>>({})

  const handleSubmit = async (event: Event) => {
    event.preventDefault()
    await onMapSchema(rawText)
  }

  const handleToggleSample = (sampleId: string, checked: boolean) => {
    setSelectedSamples((current) => ({
      ...current,
      [sampleId]: checked
    }))
  }

  const handleInsertSamples = () => {
    const selectedText = sampleSchemas
      .filter((sample) => selectedSamples[sample.id])
      .map((sample) => sample.rawSchema)

    if (selectedText.length === 0) {
      return
    }

    setRawText(selectedText.join('\n\n'))
  }

  return (
    <Paper withBorder radius="lg" p="lg" className="bg-white/80 backdrop-blur-sm shadow-sm">
      <Stack gap="md">
        <div>
          <Title order={3}>Schema Input</Title>
          <Text c="dimmed" size="sm">
            Paste any free-form data description (SQL, CSV, JSON, OpenAPI, HTML) and map it into a dataset schema with AI.
          </Text>
        </div>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Textarea
              label="Schema text"
              id="schema-input"
              minRows={8}
              autosize
              value={rawText}
              onInput={(event) => setRawText((event.target as HTMLTextAreaElement).value)}
            />

            {sampleSchemas.length > 0 ? (
              <Paper withBorder radius="md" p="sm" className="bg-slate-50/80">
                <Stack gap="xs">
                  <Text fw={600} size="sm">
                    Sample schemas
                  </Text>
                  {sampleSchemas.map((sample) => (
                    <Checkbox
                      key={sample.id}
                      label={sample.label}
                      checked={Boolean(selectedSamples[sample.id])}
                      onChange={(event) => handleToggleSample(sample.id, event.currentTarget.checked)}
                    />
                  ))}
                  <Group justify="flex-start" mt="xs">
                    <Button variant="default" size="xs" type="button" onClick={handleInsertSamples}>
                      Insert selected samples
                    </Button>
                  </Group>
                </Stack>
              </Paper>
            ) : null}

            <Group justify="flex-end">
              <Button type="submit" loading={isMapping}>
                {isMapping ? 'Mapping schema...' : 'Map schema with AI'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}
