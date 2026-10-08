export const GRID_COLS = 12
export const DEFAULT_W = 4
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
