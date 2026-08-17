import { useState } from 'preact/hooks'
import { SchemaInputPanel } from './components/SchemaInputPanel'
import { SchemaPreviewEditor } from './components/SchemaPreviewEditor'
import { normalizeSchema } from './services/schemaNormalize'
import type { CanonicalSchema } from './domain/types'
import './app.css'

const EMPTY_SCHEMA: CanonicalSchema = {
  entities: [],
  relationships: [],
  warnings: []
}

export function App() {
  const [schema, setSchema] = useState<CanonicalSchema>(EMPTY_SCHEMA)

  return (
    <main>
      <h1>Schema Normalization Studio</h1>
      <p>Paste freeform schema text, normalize it, and repair JSON directly.</p>

      <SchemaInputPanel onNormalize={(rawText) => setSchema(normalizeSchema(rawText))} />
      <SchemaPreviewEditor schema={schema} onChange={setSchema} />

      {schema.warnings.length > 0 ? (
        <section>
          <h2>Warnings</h2>
          <ul>
            {schema.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {schema.entities.length > 0 ? (
        <section>
          <h2>Detected entities</h2>
          <ul>
            {schema.entities.map((entity) => (
              <li key={entity.name}>{entity.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
