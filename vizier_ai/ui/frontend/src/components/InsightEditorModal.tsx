import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button, Checkbox, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput,
} from '@mantine/core'
import type { DatasetSchema, InsightCandidate, TraceSpec } from '../domain/types'
import { applyTraceEdit, filterValueAsString, type TraceEdit } from '../domain/chartEdit'
import { useWorkspace } from '../store/workspace'
import { editChart, type EditChartResult } from '../services/apiClient'

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'geomap', label: 'Geo map' },
]

const AGGREGATION_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'mean', label: 'Mean' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
  { value: 'median', label: 'Median' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: '', label: 'None' },
]

const FILTER_OPS = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'in', label: 'in' },
  { value: 'not_in', label: 'not in' },
]

interface InsightEditorModalProps {
  insight: InsightCandidate
  schema: DatasetSchema | null
  sessionId: string
  opened: boolean
  onClose: () => void
}

export function InsightEditorModal({ insight, schema, sessionId, opened, onClose }: InsightEditorModalProps) {
  const workspace = useWorkspace()
  const edit = workspace.insightEdits[insight.id] ?? null
  const [activeTrace, setActiveTrace] = useState(0)
  const [isRebuilding, setIsRebuilding] = useState(false)

  const originalTraces = insight.chart_spec.traces
  const originalChartType = originalTraces[0]?.chart_type ?? null
  const currentChartType = edit?.chartType ?? originalChartType

  useEffect(() => {
    setActiveTrace(0)
  }, [insight.id])

  const schemaFields = schema?.fields ?? []
  const fieldLabel = useCallback(
    (jsonPath: string): string =>
      schemaFields.find((f) => f.jsonPath === jsonPath)?.name ?? jsonPath,
    [schemaFields]
  )
  const withCurrent = useCallback(
    (eligible: typeof schemaFields, current?: string | null) => {
      const options = eligible.map((f) => ({ value: f.jsonPath, label: f.name }))
      if (current && !options.some((o) => o.value === current)) {
        options.push({ value: current, label: fieldLabel(current) })
      }
      return options
    },
    [schemaFields, fieldLabel]
  )

  const traceEdit = edit?.traceEdits?.[activeTrace]
  const effectiveTrace = useMemo(
    () => applyTraceEdit(originalTraces[activeTrace] ?? originalTraces[0], traceEdit),
    [originalTraces, activeTrace, traceEdit]
  )
  const rawFilter = effectiveTrace?.filter ?? null
  const effectiveFilter = rawFilter
    ? { field: rawFilter.field, op: rawFilter.op, value: filterValueAsString(rawFilter.value) }
    : null

  const hasFieldEditor = Boolean(sessionId) && schemaFields.length > 0

  const buildEditedTraces = (chartType: string, traceEdits: Record<number, TraceEdit>): TraceSpec[] =>
    originalTraces.map((spec, index) => {
      const edited = applyTraceEdit(spec, traceEdits[index])
      return {
        ...edited,
        chart_type: spec.chart_type === originalChartType ? chartType : spec.chart_type,
      }
    })

  const rebuild = async (chartType: string, traceEdits: Record<number, TraceEdit>) => {
    if (!sessionId) return
    setIsRebuilding(true)
    try {
      const result: EditChartResult = await editChart(sessionId, buildEditedTraces(chartType, traceEdits))
      workspace.setInsightEdit(insight.id, {
        chartType,
        traceEdits,
        plotlyData: result.plotlyData,
        plotlyLayout: result.plotlyLayout,
        staticSvg: result.isStatic ? result.staticSvg : null,
      })

    } catch {
      // selects snap back on their own: values only change when an
      // edit is actually stored
    } finally {
      setIsRebuilding(false)
    }
  }

  const handleChartTypeChange = (newType: string | null) => {
    if (!newType || newType === currentChartType) return
    rebuild(newType, edit?.traceEdits ?? {})
  }

  const handleTraceEdit = (patch: Partial<TraceEdit>) => {
    const currentTraceEdits = edit?.traceEdits ?? {}
    const merged: TraceEdit = { ...currentTraceEdits[activeTrace], ...patch }
    const nextTraceEdits = { ...currentTraceEdits, [activeTrace]: merged }
    rebuild(currentChartType ?? originalChartType ?? 'bar', nextTraceEdits)
  }

  const handleFilterToggle = (enabled: boolean) => {
    if (enabled) {
      handleTraceEdit({
        filter: { field: schemaFields[0]?.jsonPath ?? effectiveTrace.x_axis, op: 'eq', value: '' },
      })
    } else {
      handleTraceEdit({ filter: null })
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title={insight.metadata.title} size="lg" keepMounted={false}>
      <Stack gap="sm">
        <Text c="dimmed" size="sm">{insight.metadata.summary}</Text>
        {insight.metadata.description ? (
          <Text c="dimmed" size="xs">{insight.metadata.description}</Text>
        ) : null}

        {sessionId ? (
          <Group gap="xs" align="flex-end">
            <Select
              label="Chart type"
              data={CHART_TYPES}
              value={currentChartType}
              onChange={handleChartTypeChange}
              disabled={isRebuilding}
              size="sm"
              w={200}
            />
            {edit ? (
              <Button
                variant="light"
                size="compact-sm"
                onClick={() => workspace.setInsightEdit(insight.id, null)}
                mb={3}
              >
                Undo chart edit
              </Button>
            ) : null}
          </Group>
        ) : null}

        {hasFieldEditor && effectiveTrace ? (
          <Stack gap="sm" className="rounded-lg border border-gray-700/50 bg-gray-900/40 p-3">
            {originalTraces.length > 1 ? (
              <SegmentedControl
                size="xs"
                value={String(activeTrace)}
                onChange={(value) => setActiveTrace(Number(value))}
                data={originalTraces.map((trace, index) => ({
                  value: String(index),
                  label: trace.name ? `${trace.name}` : `Trace ${index + 1}`,
                }))}
              />
            ) : null}
            <Group gap="sm" align="flex-end" grow>
              <Select
                label="X axis"
                data={withCurrent(schemaFields, effectiveTrace.x_axis)}
                value={effectiveTrace.x_axis}
                onChange={(value) => value && handleTraceEdit({ x: value })}
                disabled={isRebuilding}
                size="sm"
              />
              <Select
                label="Y axis"
                data={withCurrent(
                  schemaFields.filter((f) => f.type === 'number'),
                  effectiveTrace.y_axis
                )}
                value={effectiveTrace.y_axis}
                onChange={(value) => value && handleTraceEdit({ y: value })}
                disabled={isRebuilding}
                size="sm"
              />
              {effectiveTrace.z_axis ? (
                <Select
                  label="Intensity"
                  data={withCurrent(
                    schemaFields.filter((f) => f.type === 'number'),
                    effectiveTrace.z_axis
                  )}
                  value={effectiveTrace.z_axis}
                  onChange={(value) => value && handleTraceEdit({ z: value })}
                  disabled={isRebuilding}
                  size="sm"
                />
              ) : null}
              <Select
                label="Aggregation"
                data={AGGREGATION_OPTIONS}
                value={effectiveTrace.aggregation ?? ''}
                onChange={(value) => handleTraceEdit({ aggregation: value === '' ? null : value })}
                disabled={isRebuilding}
                size="sm"
              />
            </Group>
            <Group gap="sm" align="flex-end">
              <Checkbox
                label="Filter"
                checked={effectiveFilter !== null}
                onChange={(event) => handleFilterToggle(event.currentTarget.checked)}
                disabled={isRebuilding}
                mb={8}
              />
              {effectiveFilter ? (
                <>
                  <Select
                    label="Field"
                    data={withCurrent(schemaFields, effectiveFilter.field)}
                    value={effectiveFilter.field}
                    onChange={(value) =>
                      value && handleTraceEdit({ filter: { ...effectiveFilter, field: value } })
                    }
                    disabled={isRebuilding}
                    size="sm"
                    w={200}
                  />
                  <Select
                    label="Op"
                    data={FILTER_OPS}
                    value={effectiveFilter.op}
                    onChange={(value) =>
                      value && handleTraceEdit({ filter: { ...effectiveFilter, op: value } })
                    }
                    disabled={isRebuilding}
                    size="sm"
                    w={90}
                  />
                  <TextInput
                    label="Value"
                    placeholder={effectiveFilter.op === 'in' || effectiveFilter.op === 'not_in' ? 'a, b, c' : 'value'}
                    value={filterValueAsString(effectiveFilter.value)}
                    onChange={(event) =>
                      handleTraceEdit({ filter: { ...effectiveFilter, value: event.currentTarget.value } })
                    }
                    disabled={isRebuilding}
                    size="sm"
                    w={160}
                  />
                </>
              ) : null}
            </Group>
            <Text c="dimmed" size="xs">
              Y and intensity accept numeric fields; X and filters accept any field. Edits apply per
              trace and rebuild the chart from the original recipe.
            </Text>
          </Stack>
        ) : null}
      </Stack>
    </Modal>
  )
}
