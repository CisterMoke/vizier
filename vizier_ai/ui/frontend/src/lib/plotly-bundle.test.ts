import Plotly, { ensureTraceModules } from './plotly-bundle'

const baseTraces = ['scatter', 'bar', 'pie', 'heatmap'] as const
const onDemandTraces = ['scattergeo', 'scattergl'] as const

const typeErrors = (trace: { type: string }) =>
  (Plotly.validate([trace], {}) ?? []).filter((e) => e.path?.[0] === 'type')

describe('plotly partial bundle', () => {
  it.each(baseTraces)('registers the %s trace statically', (trace) => {
    expect(typeErrors({ type: trace })).toEqual([])
  })

  it('keeps heavy trace modules out of the base bundle until requested', () => {
    for (const trace of onDemandTraces) {
      expect(typeErrors({ type: trace })).toHaveLength(1)
    }
  })

  it('registers heavy traces on demand (idempotent)', async () => {
    await ensureTraceModules([...onDemandTraces, 'scattergeo'])

    for (const trace of onDemandTraces) {
      expect(typeErrors({ type: trace })).toEqual([])
    }
  })

  it('does not ship unused heavy traces', () => {
    expect(typeErrors({ type: 'scatter3d' })).toHaveLength(1)
    expect(typeErrors({ type: 'scattermapbox' })).toHaveLength(1)
    expect(typeErrors({ type: 'candlestick' })).toHaveLength(1)
  })
})
