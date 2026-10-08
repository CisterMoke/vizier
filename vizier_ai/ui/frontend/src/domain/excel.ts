export interface ExcelOptionsState {
  sheetName: string
  header: boolean
  skipRows: number
}

export const DEFAULT_EXCEL_OPTIONS: ExcelOptionsState = {
  sheetName: '',
  header: true,
  skipRows: 0,
}

export interface ExcelOptionsPayload {
  sheet_name?: string
  header?: boolean
  skip_rows?: number
}

export function buildExcelOptionsPayload(state: ExcelOptionsState): ExcelOptionsPayload | undefined {
  const payload: ExcelOptionsPayload = {}

  const sheet = state.sheetName.trim()
  if (sheet) payload.sheet_name = sheet
  if (!state.header) payload.header = false
  if (state.skipRows > 0) payload.skip_rows = state.skipRows

  return Object.keys(payload).length > 0 ? payload : undefined
}
