import { applyTraceEdit, filterValueAsString, parseFilterValue } from './chartEdit'
import type { TraceSpec } from './types'

const base: TraceSpec = { chart_type: 'bar', x_axis: '$.x', y_axis: '$.y' }

describe('parseFilterValue', () => {
  it('splits comma-separated values for list operators', () => {
    expect(parseFilterValue('in', 'a, b ,c')).toEqual(['a', 'b', 'c'])
    expect(parseFilterValue('not_in', '')).toBe('')
  })

  it('returns raw strings for scalar operators', () => {
    expect(parseFilterValue('eq', 'EMEA')).toBe('EMEA')
  })
})

describe('filterValueAsString', () => {
  it('joins arrays and stringifies scalars', () => {
    expect(filterValueAsString(['a', 'b'])).toBe('a,b')
    expect(filterValueAsString(5)).toBe('5')
    expect(filterValueAsString(null)).toBe('')
  })
})

describe('applyTraceEdit', () => {
  it('applies provided patches and leaves the rest untouched', () => {
    expect(applyTraceEdit(base, { x: '$.week' })).toEqual({ ...base, x_axis: '$.week' })
  })

  it('sets and clears filters', () => {
    const withFilter = applyTraceEdit(base, {
      filter: { field: '$.region', op: 'in', value: 'a, b' },
    })
    expect(withFilter.filter).toEqual({ field: '$.region', op: 'in', value: ['a', 'b'] })
    expect(applyTraceEdit(withFilter, { filter: null }).filter).toBeNull()
  })

  it('returns the original spec when edit is undefined', () => {
    expect(applyTraceEdit(base, undefined)).toBe(base)
  })
})
