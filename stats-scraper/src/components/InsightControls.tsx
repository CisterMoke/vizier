import { Paper, PasswordInput, Select, Stack, Text, TextInput, Title } from '@mantine/core'
import type { ProviderId } from '../services/llmProvider'

interface InsightControlsProps {
  apiKey: string
  onApiKeyChange: (value: string) => void
  provider: ProviderId
  onProviderChange: (value: ProviderId) => void
  model: string
  onModelChange: (value: string) => void
}

const PROVIDER_OPTIONS = [
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'mistral', label: 'Mistral AI' }
]

const DEFAULT_MODELS: Record<ProviderId, string> = {
  google: 'gemini-2.0-flash',
  mistral: 'mistral-large-latest'
}

export function InsightControls({
  apiKey,
  onApiKeyChange,
  provider,
  onProviderChange,
  model,
  onModelChange
}: InsightControlsProps) {
  return (
    <Paper withBorder radius="lg" p="lg" className="bg-gray-900/50 backdrop-blur-sm shadow-sm border-gray-700/50">
      <Stack gap="md">
        <div>
          <Title order={3}>LLM Configuration</Title>
          <Text c="dimmed" size="sm">
            API key stays in memory for this browser session only.
          </Text>
        </div>

        <Select
          label="Provider"
          data={PROVIDER_OPTIONS}
          value={provider}
          onChange={(value) => {
            if (value === 'google' || value === 'mistral') {
              onProviderChange(value)
              onModelChange(DEFAULT_MODELS[value])
            }
          }}
        />

        <TextInput
          label="Model name"
          placeholder={DEFAULT_MODELS[provider]}
          value={model}
          onInput={(event) => onModelChange((event.target as HTMLInputElement).value)}
        />

        <PasswordInput
          id="llm-api-key"
          label="API key"
          placeholder="Enter your API key"
          value={apiKey}
          onInput={(event) => onApiKeyChange((event.target as HTMLInputElement).value)}
        />
      </Stack>
    </Paper>
  )
}
