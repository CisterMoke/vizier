import { normalizeSchema } from './schemaNormalize'

it('extracts at least one entity from freeform schema text', () => {
  const result = normalizeSchema('orders(id int, total decimal, created_at timestamp)')

  expect(result.entities.length).toBeGreaterThan(0)
})
