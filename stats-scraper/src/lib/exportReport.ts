import type { ExportPayload } from '../store/workspaceStore'

export const serializeExportReport = (payload: ExportPayload): string => {
  return JSON.stringify(payload, null, 2)
}
