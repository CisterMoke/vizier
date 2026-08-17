import { fireEvent, render, screen } from '@testing-library/preact'
import type { CanonicalSchema } from '../domain/types'
import { SchemaInputPanel } from './SchemaInputPanel'
import { SchemaPreviewEditor } from './SchemaPreviewEditor'

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
