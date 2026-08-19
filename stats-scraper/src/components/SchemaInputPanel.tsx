import { Button, Paper, Stack, Text, Textarea, Title } from '@mantine/core'
import { useState } from 'preact/hooks'

interface SchemaInputPanelProps {
  onGenerate: (rawText: string, rawData?: string) => Promise<void>
  isGenerating: boolean
}

export function SchemaInputPanel({ onGenerate, isGenerating }: SchemaInputPanelProps) {
  const [rawText, setRawText] = useState('')
  const [rawData, setRawData] = useState('')

  const handleSubmit = async (event: Event) => {
    event.preventDefault()
    if (rawText.trim().length > 0) {
      await onGenerate(rawText, rawData.trim().length > 0 ? rawData : undefined)
    }
  }

  return (
    <Paper withBorder radius="lg" p="lg" className="bg-gray-900/50 backdrop-blur-sm shadow-sm border-gray-700/50">
      <Stack gap="md">
        <div>
          <Title order={3}>Data Input</Title>
          <Text c="dimmed" size="sm">
            Paste any free-form data description (SQL, CSV, JSON, OpenAPI, HTML) and generate analytics instantly.
          </Text>
        </div>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Textarea
              label="Data description"
              id="schema-input"
              minRows={4}
              autosize
              placeholder="e.g. orders(id int, customer_id int, total decimal, status varchar, created_at timestamp)"
              value={rawText}
              onInput={(event) => setRawText((event.target as HTMLTextAreaElement).value)}
            />

            <Textarea
              label="Real data (optional)"
              id="raw-data-input"
              minRows={4}
              autosize
              placeholder="Paste CSV, JSON array, or JSONL data here to visualize with real data instead of mock data"
              value={rawData}
              onInput={(event) => setRawData((event.target as HTMLTextAreaElement).value)}
            />

            <Button type="submit" loading={isGenerating} disabled={isGenerating}>
              {isGenerating ? 'Analyzing & generating...' : 'Generate analytics'}
            </Button>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}
