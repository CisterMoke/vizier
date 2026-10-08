import type { TraceSpec } from './types'

/** User modifications to a single trace, applied on top of the ORIGINAL
 * recipe (never on top of a previous edit result). */
export interface TraceEdit {
  x?: string
  y?: string
  z?: string
  aggregation?: string | null
  filter?: { field: string; op: string; value: string } | null
}

export interface InsightEdit {
  chartType: string
  traceEdits: Record<number, TraceEdit>
  plotlyData: unknown[] | null
  plotlyLayout: Record<string, unknown> | null
  staticSvg: string | null
}

/** The filter value as a plain string for the input; comma-separated
 * lists for the in/not_in operators round-trip as arrays. */
export const parseFilterValue = (op: string, value: string): unknown => {
  const trimmed = value.trim()
  if ((op === 'in' || op === 'not_in') && trimmed) {
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return value
}

export const filterValueAsString = (value: unknown): string =>
  Array.isArray(value) ? value.join(',') : value === null || value === undefined ? '' : String(value)

export const applyTraceEdit = (spec: TraceSpec, edit: TraceEdit | undefined): TraceSpec => {
  if (!edit) return spec
  const next: TraceSpec = { ...spec }
  if (edit.x !== undefined) next.x_axis = edit.x
  if (edit.y !== undefined) next.y_axis = edit.y
  if (edit.z !== undefined) next.z_axis = edit.z
  if (edit.aggregation !== undefined) next.aggregation = edit.aggregation
  if (edit.filter !== undefined) {
    next.filter = edit.filter === null
      ? null
      : { field: edit.filter.field, op: edit.filter.op, value: parseFilterValue(edit.filter.op, edit.filter.value) }
  }
  return next
}
