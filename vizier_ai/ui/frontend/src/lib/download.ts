import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'
import { buildDownloadBundle } from '../domain/bundle'
import Plotly from './plotly-bundle'

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'insight'
  )
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function downloadJson(filename: string, data: unknown): void {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename)
}

export async function downloadSvg(url: string, filename: string): Promise<void> {
  const response = await fetch(url)
  const blob = await response.blob()
  triggerDownload(blob, filename)
}

export async function exportPlotImage(graphDiv: HTMLElement, title: string): Promise<void> {
  await Plotly.downloadImage(graphDiv, {
    format: 'png',
    width: 900,
    height: 500,
    filename: slugify(title),
  })
}

export function saveInsightBundle(insight: InsightCandidate, context: BundleContext | null): boolean {
  const bundle = buildDownloadBundle([insight], context)
  if (!bundle) return false
  downloadJson(`${slugify(insight.metadata.title)}-bundle.json`, bundle)
  return true
}
