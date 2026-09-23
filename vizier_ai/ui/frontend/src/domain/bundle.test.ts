import { buildDownloadBundle, type BundleContext } from './bundle'
import type { InsightCandidate } from './types'

const insight: InsightCandidate = {
  id: 'ins-1',
  metadata: { title: 'T', summary: 'S', keyIdea: 'K', description: null },
  chart_spec: {
    traces: [{ chart_type: 'bar', x_axis: '$.county', y_axis: '$.county' }],
    plotlyData: [{ type: 'bar', x: ['King'], y: [5] }],
    plotlyLayout: { title: { text: 'T' } }
  },
  mock_seed: 1337
}

const context: BundleContext = {
  schema: { source: 'test', fields: [{ name: 'County', jsonPath: '$.county' }] },
  dataProfile: { columns: [{ name: '$.county', generator: 'category' }] }
}

describe('buildDownloadBundle', () => {
  it('builds a versioned bundle with schema and profile', () => {
    const bundle = buildDownloadBundle([insight], context)

    expect(bundle).not.toBeNull()
    expect(bundle!.version).toBe(1)
    expect(bundle!.schema).toEqual(context.schema)
    expect(bundle!.data_profile).toEqual(context.dataProfile)
  })

  it('maps insights to recipes without rendered data points', () => {
    const bundle = buildDownloadBundle([insight], context)!

    expect(bundle.insights).toEqual([
      {
        id: 'ins-1',
        metadata: insight.metadata,
        traces: insight.chart_spec.traces,
        mock_seed: 1337
      }
    ])
    expect(JSON.stringify(bundle)).not.toContain('plotlyData')
    expect(JSON.stringify(bundle)).not.toContain('plotlyLayout')
  })

  it('omits data_profile when the context has no profile', () => {
    const realContext: BundleContext = { schema: context.schema, dataProfile: null }

    const bundle = buildDownloadBundle([insight], realContext)!

    expect(bundle.data_profile).toBeUndefined()
  })

  it('returns null without a schema in the context', () => {
    expect(buildDownloadBundle([insight], null)).toBeNull()
    expect(buildDownloadBundle([insight], { schema: null, dataProfile: null })).toBeNull()
  })

  it('persists csv options so loading needs no manual configuration', () => {
    const bundle = buildDownloadBundle([insight], context, { delimiter: ';' })!

    expect(bundle.csv_options).toEqual({ delimiter: ';' })
  })

  it('defaults to null csv options when none were used', () => {
    const bundle = buildDownloadBundle([insight], context)!

    expect(bundle.csv_options).toBeNull()
  })
})
