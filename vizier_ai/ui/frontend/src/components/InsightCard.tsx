import { useState } from 'react'
import { ActionIcon, Card, Group, Text, Title, Tooltip } from '@mantine/core'
import {
  ArrowCounterClockwise,
  Camera,
  DownloadSimple,
  PencilSimple,
  Trash,
} from '@phosphor-icons/react'
import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'
import { InsightChart } from './InsightChart'
import { ChartErrorBoundary } from './ChartErrorBoundary'
import { useWorkspace } from '../store/workspace'
import { downloadSvg, exportPlotImage, saveInsightBundle, slugify } from '../lib/download'
import { insightSvgUrl } from '../services/apiClient'

export const SHOW_SUMMARY = true

interface InsightCardProps {
  insight: InsightCandidate
  sessionId: string
  bundleContext: BundleContext | null
  onEdit: () => void
  onDelete: () => void
}

export function InsightCard({ insight, sessionId, bundleContext, onEdit, onDelete }: InsightCardProps) {
  const workspace = useWorkspace()
  const edit = workspace.insightEdits[insight.id] ?? null
  const [graphDiv, setGraphDiv] = useState<HTMLElement | null>(null)

  const isStatic =
    (edit?.staticSvg ?? null) !== null || (insight.chart_spec.isStatic === true && edit === null)

  const handleExportImage = () => {
    if (edit?.staticSvg) {
      const anchor = document.createElement('a')
      anchor.href = `data:image/svg+xml;utf8,${encodeURIComponent(edit.staticSvg)}`
      anchor.download = `${slugify(insight.metadata.title)}.svg`
      anchor.click()
      return
    }
    if (isStatic) {
      void downloadSvg(insightSvgUrl(sessionId, insight.id), `${slugify(insight.metadata.title)}.svg`)
      return
    }
    if (graphDiv) void exportPlotImage(graphDiv, insight.metadata.title)
  }

  return (
    <Card
      withBorder
      radius="lg"
      padding="sm"
      data-testid="chart-card"
      className="group flex h-full w-full flex-col gap-2 bg-gray-900/50 shadow-lg backdrop-blur-sm border-gray-700/50"
    >
      <Group justify="space-between" wrap="nowrap" gap="xs" className="grid-drag-handle cursor-grab">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          {edit ? (
            <span
              data-testid="edited-dot"
              title="Edited"
              className="h-2 w-2 shrink-0 rounded-full bg-cyan-400"
            />
          ) : null}
          <Title order={4} lineClamp={1}>{insight.metadata.title}</Title>
        </Group>
        <Group
          gap={4}
          wrap="nowrap"
          className="pointer-coarse:opacity-100 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <ActionIcon variant="subtle" aria-label="Edit chart" title="Edit chart" onClick={onEdit}>
            <PencilSimple size={16} aria-hidden="true" />
          </ActionIcon>
          <Tooltip
            label={bundleContext?.schema ? 'Download insight bundle' : 'No schema context to save a bundle'}
            position="bottom"
          >
            <ActionIcon
              variant="subtle"
              aria-label="Save insight bundle"
              title="Save insight bundle"
              data-disabled={!bundleContext?.schema}
              onClick={() => bundleContext?.schema && saveInsightBundle(insight, bundleContext)}
            >
              <DownloadSimple size={16} aria-hidden="true" />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            variant="subtle"
            aria-label="Export chart image"
            title="Export chart image"
            disabled={!isStatic && !graphDiv}
            onClick={handleExportImage}
          >
            <Camera size={16} aria-hidden="true" />
          </ActionIcon>
          {edit ? (
            <ActionIcon
              variant="subtle"
              aria-label="Undo chart edit"
              title="Undo chart edit"
              onClick={() => workspace.setInsightEdit(insight.id, null)}
            >
              <ArrowCounterClockwise size={16} aria-hidden="true" />
            </ActionIcon>
          ) : null}
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Delete insight"
            title="Delete insight"
            onClick={onDelete}
          >
            <Trash size={16} aria-hidden="true" />
          </ActionIcon>
        </Group>
      </Group>

      <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
        <ChartErrorBoundary>
          <InsightChart
            insight={insight}
            edit={edit}
            sessionId={sessionId}
            onGraphDivChange={setGraphDiv}
          />
        </ChartErrorBoundary>
      </div>

      {SHOW_SUMMARY ? (
        <Text c="dimmed" size="sm" lineClamp={2}>{insight.metadata.summary}</Text>
      ) : null}
    </Card>
  )
}
