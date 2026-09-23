import Plotly from './plotly-bundle'

const requiredTraces = ['scatter', 'scattergl', 'bar', 'pie', 'heatmap', 'scattergeo'] as const

const typeErrors = (trace: { type: string }) =>
  (Plotly.validate([trace], {}) ?? []).filter((e) => e.path?.[0] === 'type')

describe('plotly partial bundle', () => {
  it.each(requiredTraces)('registers the %s trace used by vizier', (trace) => {
    expect(typeErrors({ type: trace })).toEqual([])
  })

  it('does not ship unused heavy traces', () => {
    expect(typeErrors({ type: 'scatter3d' })).toHaveLength(1)
    expect(typeErrors({ type: 'scattermapbox' })).toHaveLength(1)
    expect(typeErrors({ type: 'candlestick' })).toHaveLength(1)
  })
})
