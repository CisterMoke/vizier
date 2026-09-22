import { buildConstraintsPayload, EMPTY_CONSTRAINTS, type ConstraintsState } from './constraints'

describe('buildConstraintsPayload', () => {
  it('returns undefined for the empty state', () => {
    expect(buildConstraintsPayload(EMPTY_CONSTRAINTS)).toBeUndefined()
  })

  it('returns undefined when guidance is only whitespace', () => {
    const state: ConstraintsState = { ...EMPTY_CONSTRAINTS, guidance: '   ' }

    expect(buildConstraintsPayload(state)).toBeUndefined()
  })

  it('maps chart type includes to the API payload', () => {
    const state: ConstraintsState = { ...EMPTY_CONSTRAINTS, includeChartTypes: ['bar', 'line'] }

    expect(buildConstraintsPayload(state)).toEqual({ include_chart_types: ['bar', 'line'] })
  })

  it('maps chart type excludes to the API payload', () => {
    const state: ConstraintsState = { ...EMPTY_CONSTRAINTS, excludeChartTypes: ['pie'] }

    expect(buildConstraintsPayload(state)).toEqual({ exclude_chart_types: ['pie'] })
  })

  it('maps field includes and excludes to the API payload', () => {
    const state: ConstraintsState = {
      ...EMPTY_CONSTRAINTS,
      includeFields: ['county'],
      excludeFields: ['id'],
    }

    expect(buildConstraintsPayload(state)).toEqual({
      include_fields: ['county'],
      exclude_fields: ['id'],
    })
  })

  it('trims guidance and includes it with other constraints', () => {
    const state: ConstraintsState = {
      ...EMPTY_CONSTRAINTS,
      includeChartTypes: ['geomap'],
      guidance: '  focus on regions  ',
    }

    expect(buildConstraintsPayload(state)).toEqual({
      include_chart_types: ['geomap'],
      guidance: 'focus on regions',
    })
  })
})
