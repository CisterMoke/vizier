import { normalizeSchema } from './schemaNormalize'

it('extracts at least one entity from freeform schema text', () => {
  const result = normalizeSchema('orders(id int, total decimal, created_at timestamp)')

  expect(result.entities.length).toBeGreaterThan(0)
})

it('keeps decimal precision types intact when splitting fields', () => {
  const result = normalizeSchema('orders(id int, total decimal(10,2), created_at timestamp)')

  expect(result.entities[0].fields.map((field) => field.name)).toEqual(['id', 'total', 'created_at'])
  expect(result.entities[0].fields[1].type).toBe('number')
})
