import { useState } from 'preact/hooks'

interface SchemaInputPanelProps {
  onNormalize: (rawText: string) => void
}

export function SchemaInputPanel({ onNormalize }: SchemaInputPanelProps) {
  const [rawText, setRawText] = useState('orders(id int, total decimal, created_at timestamp)')

  const handleSubmit = (event: Event) => {
    event.preventDefault()
    onNormalize(rawText)
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
        <button type="submit">Normalize schema</button>
      </form>
    </section>
  )
}
