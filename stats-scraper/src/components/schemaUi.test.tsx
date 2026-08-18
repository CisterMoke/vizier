import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import type { DatasetSchema } from '../domain/types'
import { SchemaInputPanel } from './SchemaInputPanel'
import { SchemaPreviewEditor } from './SchemaPreviewEditor'
import { SAMPLE_SCHEMAS } from '../data/sampleSchemas'

const sampleSchema: DatasetSchema = {
  source: 'SQL: orders table',
  fields: [{ name: 'id', type: 'number', nullable: false, semanticType: 'identifier' }],
  warnings: []
}

const renderWithMantine = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

it('submits freeform schema text through the mapping callback', () => {
  const onMapSchema = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<SchemaInputPanel onMapSchema={onMapSchema} isMapping={false} />)

  fireEvent.input(screen.getByLabelText(/schema text/i), {
    target: { value: 'orders(id int)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /map schema with ai/i }))

  expect(onMapSchema).toHaveBeenCalledWith('orders(id int)')
})

it('allows selecting multiple sample schemas and inserting them into schema text', () => {
  const onMapSchema = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(
    <SchemaInputPanel onMapSchema={onMapSchema} isMapping={false} sampleSchemas={SAMPLE_SCHEMAS} />
  )

  fireEvent.click(screen.getByLabelText(/retail orders/i))
  fireEvent.click(screen.getByLabelText(/product usage/i))
  fireEvent.click(screen.getByRole('button', { name: /insert selected samples/i }))

  const textarea = screen.getByLabelText(/schema text/i) as HTMLTextAreaElement
  expect(textarea.value).toContain('orders(id int, customer_id int, total decimal, status varchar, created_at timestamp)')
  expect(textarea.value).toContain('event_id,user_id,event_name,session_duration,timestamp')

  fireEvent.click(screen.getByRole('button', { name: /map schema with ai/i }))
  expect(onMapSchema).toHaveBeenCalledWith(textarea.value)
})

it('emits dataset schema changes from the JSON preview editor', () => {
  const onChange = vi.fn()
  renderWithMantine(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  fireEvent.input(screen.getByLabelText(/dataset schema json/i), {
    target: {
      value: '{"source":"CSV: test","fields":[{"name":"users","type":"string","nullable":false}],"warnings":[]}'
    }
  })

  expect(onChange).toHaveBeenCalledWith({
    source: 'CSV: test',
    fields: [{ name: 'users', type: 'string', nullable: false }],
    warnings: []
  })
})

it('keeps local draft JSON when edit is invalid and only emits when valid', () => {
  const onChange = vi.fn()
  renderWithMantine(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/dataset schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"fields": [' }
  })

  expect(onChange).not.toHaveBeenCalled()
  expect(editor.value).toBe('{"fields": [')
  expect(screen.getByRole('alert')).toBeInTheDocument()

  fireEvent.input(editor, {
    target: {
      value: '{"source":"CSV: x","fields":[{"name":"sku","type":"string","nullable":false}],"warnings":[]}'
    }
  })

  expect(onChange).toHaveBeenLastCalledWith({
    source: 'CSV: x',
    fields: [{ name: 'sku', type: 'string', nullable: false }],
    warnings: []
  })
})

it('syncs textarea content to external schema updates after local edits', () => {
  const onChange = vi.fn()
  const { rerender } = renderWithMantine(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/dataset schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"fields": [' }
  })

  expect(editor.value).toBe('{"fields": [')

  const externalSchema: DatasetSchema = {
    source: 'CSV: customers',
    fields: [{ name: 'id', type: 'number', nullable: false }],
    warnings: []
  }

  rerender(
    <MantineProvider>
      <SchemaPreviewEditor schema={externalSchema} onChange={onChange} />
    </MantineProvider>
  )

  expect(editor.value).toContain('CSV: customers')
})

it('clears stale parse error when external schema update resets draft to valid JSON', () => {
  const onChange = vi.fn()
  const { rerender } = renderWithMantine(<SchemaPreviewEditor schema={sampleSchema} onChange={onChange} />)

  const editor = screen.getByLabelText(/dataset schema json/i) as HTMLTextAreaElement

  fireEvent.input(editor, {
    target: { value: '{"fields": [' }
  })

  expect(screen.getByRole('alert')).toBeInTheDocument()

  const externalSchema: DatasetSchema = {
    source: 'CSV: invoices',
    fields: [{ name: 'id', type: 'number', nullable: false }],
    warnings: []
  }

  rerender(
    <MantineProvider>
      <SchemaPreviewEditor schema={externalSchema} onChange={onChange} />
    </MantineProvider>
  )

  expect(editor.value).toContain('CSV: invoices')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
