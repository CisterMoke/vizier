import {
  appendLayout,
  defaultLayout,
  rebuildLayout,
  GRID_COLS,
  sanitizeLayout,
  type LayoutItem,
} from './layout'

describe('defaultLayout', () => {
  it('places ids in reading order, two 6-wide cards per 12-col row', () => {
    const layout = defaultLayout(['a', 'b', 'c', 'd'])
    expect(layout).toEqual([
      { i: 'a', x: 0, y: 0, w: 6, h: 4 },
      { i: 'b', x: 6, y: 0, w: 6, h: 4 },
      { i: 'c', x: 0, y: 4, w: 6, h: 4 },
      { i: 'd', x: 6, y: 4, w: 6, h: 4 },
    ])
  })

  it('returns an empty array for no ids', () => {
    expect(defaultLayout([])).toEqual([])
  })
})

describe('appendLayout', () => {
  it('appends below the existing layout without disturbing it', () => {
    const existing: LayoutItem[] = [{ i: 'a', x: 0, y: 0, w: 6, h: 3 }]
    const next = appendLayout(existing, ['b', 'c'])
    expect(next[0]).toBe(existing[0])
    expect(next.slice(1)).toEqual([
      { i: 'b', x: 0, y: 3, w: 6, h: 4 },
      { i: 'c', x: 6, y: 3, w: 6, h: 4 },
    ])
  })

  it('wraps new ids to a new row at the 12-column cap', () => {
    const next = appendLayout([], ['a', 'b', 'c', 'd'])
    expect(next[3]).toEqual({ i: 'd', x: 6, y: 4, w: 6, h: 4 })
    expect(next.every((item) => item.x + item.w <= GRID_COLS)).toBe(true)
  })
})

describe('sanitizeLayout', () => {
  it('drops items whose id is gone and clamps sizes to bounds', () => {
    const items: LayoutItem[] = [
      { i: 'a', x: 0, y: 0, w: 1, h: 1 },
      { i: 'gone', x: 0, y: 8, w: 4, h: 4 },
      { i: 'b', x: 4, y: 0, w: 99, h: 2 },
    ]
    expect(sanitizeLayout(items, ['a', 'b'])).toEqual([
      { i: 'a', x: 0, y: 0, w: 2, h: 2 },
      { i: 'b', x: 4, y: 0, w: 12, h: 2 },
    ])
  })

  it('keeps custom sizes that are within bounds', () => {
    const items: LayoutItem[] = [{ i: 'a', x: 2, y: 4, w: 6, h: 5 }]
    expect(sanitizeLayout(items, ['a'])).toEqual(items)
  })
})

describe('rebuildLayout', () => {
  it('rebuilds for a column count keeping reading order and heights', () => {
    const existing: LayoutItem[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: 5 },
      { i: 'b', x: 6, y: 0, w: 6, h: 3 },
      { i: 'c', x: 0, y: 5, w: 12, h: 2 },
    ]

    expect(rebuildLayout(existing, 1)).toEqual([
      { i: 'a', x: 0, y: 0, w: 12, h: 5 },
      { i: 'b', x: 0, y: 5, w: 12, h: 3 },
      { i: 'c', x: 0, y: 8, w: 12, h: 2 },
    ])

    expect(rebuildLayout(existing, 3)).toEqual([
      { i: 'a', x: 0, y: 0, w: 4, h: 5 },
      { i: 'b', x: 4, y: 0, w: 4, h: 3 },
      { i: 'c', x: 8, y: 0, w: 4, h: 2 },
    ])
  })

  it('sorts by reading order before packing', () => {
    const shuffled: LayoutItem[] = [
      { i: 'b', x: 6, y: 0, w: 6, h: 3 },
      { i: 'a', x: 0, y: 0, w: 6, h: 5 },
    ]
    expect(rebuildLayout(shuffled, 1)).toEqual([
      { i: 'a', x: 0, y: 0, w: 12, h: 5 },
      { i: 'b', x: 0, y: 5, w: 12, h: 3 },
    ])
  })

  it('stacks rows at the tallest member of the previous row', () => {
    const ragged: LayoutItem[] = [
      { i: 'a', x: 0, y: 0, w: 6, h: 5 },
      { i: 'b', x: 6, y: 0, w: 6, h: 3 },
      { i: 'c', x: 0, y: 5, w: 6, h: 2 },
    ]
    expect(rebuildLayout(ragged, 2)).toEqual([
      { i: 'a', x: 0, y: 0, w: 6, h: 5 },
      { i: 'b', x: 6, y: 0, w: 6, h: 3 },
      { i: 'c', x: 0, y: 5, w: 6, h: 2 },
    ])
  })
})
