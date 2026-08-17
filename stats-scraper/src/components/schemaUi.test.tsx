import { fireEvent, render, screen } from '@testing-library/preact'
import type { CanonicalSchema } from '../domain/types'
import { SchemaInputPanel } from './SchemaInputPanel'
import { SchemaPreviewEditor } from './SchemaPreviewEditor'
import { SAMPLE_SCHEMAS } from '../data/sampleSchemas'

const sampleSchema: CanonicalSchema = {
  entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
  relationships: [],
  warnings: []
}

it('submits freeform schema text through the normalize callback', () => {
  const onNormalize = vi.fn()
  render(<SchemaInputPanel onNormalize={onNormalize} />)

  fireEvent.input(screen.getByLabelText(/schema text/i), {
    target: { value: 'orders(id int)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /normalize schema/i }))

  expect(onNormalize).toHaveBeenCalledWith('orders(id int)')
})

it('allows selecting multiple sample schemas and inserting them into schema text', () => {
  const onNormalize = vi.fn()
  render(<SchemaInputPanel onNormalize={onNormalize} sampleSchemas={SAMPLE_SCHEMAS} />)

  fireEvent.click(screen.getByLabelText(/retail orders/i))
  fireEvent.click(screen.getByLabelText(/product usage/i))
  fireEvent.click(screen.getByRole('button', { name: /insert selected samples/i }))

  const textarea = screen.getByLabelText(/schema text/i) as HTMLTextAreaElement
  expect(textarea.value).toContain('orders(id int, customer_id int, total decimal, created_at timestamp)')
  expect(textarea.value).toContain('events(id int, user_id int, event_name text, occurred_at timestamp)')

  fireEvent.click(screen.getByRole('button', { name: /normalize schema/i }))
  expect(onNormalize).toHaveBeenCalledWith(textarea.value)
})

it('emits canonical schema changes from the JSON preview editor', () => {
  const onChange = vi.fn()
  render(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  fireEvent.input(screen.getByLabelText(/canonical schema json/i), {
    target: {
      value: '{"entities":[{"name":"users","fields":[{"name":"id","type":"number","nullable":false}]}],"relationships":[],"warnings":[]}'
    }
  })

  expect(onChange).toHaveBeenCalledWith({
    entities: [{ name: 'users', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
    warnings: []
  })
})

it('keeps local draft JSON when edit is invalid and only emits when valid', () => {
  const onChange = vi.fn()
  render(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/canonical schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"entities": [' }
  })

  expect(onChange).not.toHaveBeenCalled()
  expect(editor.value).toBe('{"entities": [')
  expect(screen.getByRole('alert')).toBeInTheDocument()

  fireEvent.input(editor, {
    target: {
      value: '{"entities":[{"name":"products","fields":[{"name":"sku","type":"string","nullable":false}]}],"relationships":[],"warnings":[]}'
    }
  })

  expect(onChange).toHaveBeenLastCalledWith({
    entities: [{ name: 'products', fields: [{ name: 'sku', type: 'string', nullable: false }] }],
    relationships: [],
    warnings: []
  })
})

it('syncs textarea content to external schema updates after local edits', () => {
  const onChange = vi.fn()
  const { rerender } = render(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/canonical schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"entities": [' }
  })

  expect(editor.value).toBe('{"entities": [')

  const externalSchema: CanonicalSchema = {
    entities: [{ name: 'customers', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
    warnings: []
  }

  rerender(<SchemaPreviewEditor schema={externalSchema} onChange={onChange} />)

  expect(editor.value).toContain('"customers"')
})

it('clears stale parse error when external schema update resets draft to valid JSON', () => {
  const onChange = vi.fn()
  const { rerender } = render(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/canonical schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"entities": [' }
  })

  expect(screen.getByRole('alert')).toBeInTheDocument()

  const externalSchema: CanonicalSchema = {
    entities: [{ name: 'invoices', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
    warnings: []
  }

  rerender(<SchemaPreviewEditor schema={externalSchema} onChange={onChange} />)

  expect(editor.value).toContain('"invoices"')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
