export const GRID_COLS = 12
export const DEFAULT_W = 6
export const DEFAULT_H = 4
export const MIN_W = 2
export const MIN_H = 2

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const perRow = GRID_COLS / DEFAULT_W

const footprint = (id: string, index: number, baseY: number): LayoutItem => ({
  i: id,
  x: (index % perRow) * DEFAULT_W,
  y: baseY + Math.floor(index / perRow) * DEFAULT_H,
  w: DEFAULT_W,
  h: DEFAULT_H,
})

export function defaultLayout(ids: readonly string[]): LayoutItem[] {
  return ids.map((id, index) => footprint(id, index, 0))
}

export function appendLayout(existing: LayoutItem[], ids: readonly string[]): LayoutItem[] {
  const maxY = existing.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  return [...existing, ...ids.map((id, index) => footprint(id, index, maxY))]
}

export function sanitizeLayout(items: LayoutItem[], ids: readonly string[]): LayoutItem[] {
  const idSet = new Set(ids)
  return items
    .filter((item) => idSet.has(item.i))
    .map((item) => ({
      ...item,
      w: Math.min(Math.max(item.w, MIN_W), GRID_COLS),
      h: Math.max(item.h, MIN_H),
    }))
}

/** Rebuild the mosaic for a target cards-per-row count: keeps reading
 * order (by y, then x) and each card's height; widths become equal
 * columns of the 12-col grid; rows stack at the tallest member. */
export function rebuildLayout(items: LayoutItem[], columns: number): LayoutItem[] {
  const w = GRID_COLS / columns
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const result: LayoutItem[] = []
  let indexInRow = 0
  let y = 0
  let rowMaxH = 0
  for (const item of sorted) {
    if (indexInRow === columns) {
      indexInRow = 0
      y += rowMaxH
      rowMaxH = 0
    }
    result.push({ i: item.i, x: indexInRow * w, y, w, h: item.h })
    rowMaxH = Math.max(rowMaxH, item.h)
    indexInRow++
  }
  return result
}
