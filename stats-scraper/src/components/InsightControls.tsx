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
    <section>
      <h2>Insight Generation</h2>
      <label for="llm-api-key">LLM API key</label>
      <input
        id="llm-api-key"
        type="password"
        value={apiKey}
        onInput={(event) => onApiKeyChange((event.target as HTMLInputElement).value)}
      />
      <button type="button" onClick={onGenerate} disabled={disabled || isGenerating || apiKey.trim().length === 0}>
        {isGenerating ? 'Generating...' : 'Generate insights'}
      </button>
    </section>
  )
}
