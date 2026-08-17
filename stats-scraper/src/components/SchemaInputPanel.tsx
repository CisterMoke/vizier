import { useState } from 'preact/hooks'
import type { SampleSchema } from '../data/sampleSchemas'

interface SchemaInputPanelProps {
  onNormalize: (rawText: string) => void
  sampleSchemas?: SampleSchema[]
}

export function SchemaInputPanel({ onNormalize, sampleSchemas = [] }: SchemaInputPanelProps) {
  const [rawText, setRawText] = useState('orders(id int, total decimal, created_at timestamp)')
  const [selectedSamples, setSelectedSamples] = useState<Record<string, boolean>>({})

  const handleSubmit = (event: Event) => {
    event.preventDefault()
    onNormalize(rawText)
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
    <section>
      <h2>Schema Input</h2>
      <form onSubmit={handleSubmit}>
        <label for="schema-input">Schema text</label>
        <textarea
          id="schema-input"
          rows={8}
          value={rawText}
          onInput={(event) => setRawText((event.target as HTMLTextAreaElement).value)}
        />
        {sampleSchemas.length > 0 ? (
          <fieldset>
            <legend>Sample schemas</legend>
            {sampleSchemas.map((sample) => (
              <label key={sample.id}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedSamples[sample.id])}
                  onInput={(event) =>
                    handleToggleSample(sample.id, (event.target as HTMLInputElement).checked)
                  }
                />
                {sample.label}
              </label>
            ))}
            <button type="button" onClick={handleInsertSamples}>
              Insert selected samples
            </button>
          </fieldset>
        ) : null}
        <button type="submit">Normalize schema</button>
      </form>
    </section>
  )
}
