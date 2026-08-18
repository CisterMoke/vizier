import { Button, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'

interface InsightControlsProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  onGenerate: () => void
  isGenerating: boolean
  disabled?: boolean
}

export function InsightControls({
  apiKey,
  onApiKeyChange,
  onGenerate,
  isGenerating,
  disabled = false
}: InsightControlsProps) {
  return (
    <Paper withBorder radius="lg" p="lg" className="bg-white/80 backdrop-blur-sm shadow-sm">
      <Stack gap="md">
        <div>
          <Title order={3}>Insight Generation</Title>
          <Text c="dimmed" size="sm">
            API key stays in memory for this browser session only.
          </Text>
        </div>

        <PasswordInput
          id="llm-api-key"
          label="LLM API key"
          placeholder="sk-..."
          value={apiKey}
          onInput={(event) => onApiKeyChange((event.target as HTMLInputElement).value)}
        />

        <Button type="button" onClick={onGenerate} loading={isGenerating} disabled={disabled || isGenerating}>
          {isGenerating ? 'Generating insights...' : 'Generate insights'}
        </Button>
      </Stack>
    </Paper>
  )
}
