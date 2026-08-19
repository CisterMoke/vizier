import type { ExportPayload } from '../store/workspaceStore'

export const serializeExportReport = (payload: ExportPayload): string => {
  return JSON.stringify(payload, null, 2)
}

export const downloadExportReport = (payload: ExportPayload, fileName = 'analytics-report.json') => {
  const json = serializeExportReport(payload)
  const blob = new Blob([json], { type: 'application/json' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
