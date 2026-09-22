export interface ConstraintsState {
  includeChartTypes: string[]
  excludeChartTypes: string[]
  includeFields: string[]
  excludeFields: string[]
  guidance: string
}

export const EMPTY_CONSTRAINTS: ConstraintsState = {
  includeChartTypes: [],
  excludeChartTypes: [],
  includeFields: [],
  excludeFields: [],
  guidance: '',
}

export interface InsightConstraintsPayload {
  include_chart_types?: string[]
  exclude_chart_types?: string[]
  include_fields?: string[]
  exclude_fields?: string[]
  guidance?: string
}

export function buildConstraintsPayload(state: ConstraintsState): InsightConstraintsPayload | undefined {
  const payload: InsightConstraintsPayload = {}
  if (state.includeChartTypes.length > 0) payload.include_chart_types = [...state.includeChartTypes]
  if (state.excludeChartTypes.length > 0) payload.exclude_chart_types = [...state.excludeChartTypes]
  if (state.includeFields.length > 0) payload.include_fields = [...state.includeFields]
  if (state.excludeFields.length > 0) payload.exclude_fields = [...state.excludeFields]
  const guidance = state.guidance.trim()
  if (guidance) payload.guidance = guidance
  return Object.keys(payload).length > 0 ? payload : undefined
}
