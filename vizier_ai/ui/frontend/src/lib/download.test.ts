import { downloadJson, saveInsightBundle, slugify } from './download'
import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'

vi.mock('./plotly-bundle', () => ({ default: { downloadImage: vi.fn() } }))

const createObjectURL = vi.fn(() => 'blob:mock')
const revokeObjectURL = vi.fn()

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
})

const insight: InsightCandidate = {
  id: 'ins-1',
  metadata: { title: 'Revenue by Category!', summary: 'S', description: null },
  chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} },
}

const context: BundleContext = { schema: { source: 's', fields: [] }, dataProfile: null }

it('slugifies titles into filenames', () => {
  expect(slugify('Revenue by Category!')).toBe('revenue-by-category')
  expect(slugify('   ')).toBe('insight')
})

it('downloadJson creates a blob URL and triggers an anchor download', () => {
  const click = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
  downloadJson('x.json', { a: 1 })
  expect(createObjectURL).toHaveBeenCalledTimes(1)
  expect(click).toHaveBeenCalled()
})

it('saveInsightBundle returns false without schema and true with it', () => {
  expect(saveInsightBundle(insight, null)).toBe(false)
  expect(saveInsightBundle(insight, context)).toBe(true)
})
