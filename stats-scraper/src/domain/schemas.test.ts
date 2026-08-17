import { parseCanonicalSchema } from './schemas'

it('accepts a minimal canonical schema payload', () => {
  const parsed = parseCanonicalSchema({
    entities: [{ name: 'orders', fields: [{ name: 'id', type: 'number', nullable: false }] }],
    relationships: [],
    warnings: []
  })

  expect(parsed.entities[0].name).toBe('orders')
})
