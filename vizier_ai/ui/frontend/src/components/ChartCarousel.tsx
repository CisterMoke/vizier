import { ActionIcon, Badge, Button, Card, Checkbox, Group, SegmentedControl, Select, Skeleton, Stack, Text, TextInput, Title, Modal } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DatasetSchema, InsightCandidate, TraceSpec } from '../domain/types'
import PlotlyComponent from 'react-plotly.js'
import { ensureTraceModules } from '../lib/plotly-bundle'
import { editChart, insightSvgUrl, type EditChartResult } from '../services/apiClient'

// react-plotly.js ships CJS; bundler interop can deliver the module wrapper
// ({ default: Component }) instead of the component itself.
const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

// Static object identities: PlotlyChart re-plots (Plotly.react) whenever
// data/layout/config prop identity changes, so these must never be inlined.
const PLOT_CONFIG = { responsive: true, displaylogo: false }
const PLOT_STYLE = { width: '100%', height: '400px' }

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

/** User modifications to a single trace, applied on top of the ORIGINAL
 * recipe (never on top of a previous edit result). */
interface TraceEdit {
  x?: string
  y?: string
  z?: string
  aggregation?: string | null
  filter?: { field: string; op: string; value: string } | null
}

interface InsightEdit {
  chartType: string
  traceEdits: Record<number, TraceEdit>
  plotlyData: unknown[] | null
  plotlyLayout: Record<string, unknown> | null
  staticSvg: string | null
}

interface ChartCarouselProps {
  insights: InsightCandidate[]
  sessionId: string
  onDelete: (insightId: string) => void
  schema?: DatasetSchema | null
}

/** The filter value as a plain string for the input; comma-separated
 * lists for the in/not_in operators round-trip as arrays. */
const parseFilterValue = (op: string, value: string): unknown => {
  const trimmed = value.trim()
  if ((op === 'in' || op === 'not_in') && trimmed) {
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return value
}

const filterValueAsString = (value: unknown): string =>
  Array.isArray(value) ? value.join(',') : value === null || value === undefined ? '' : String(value)

const applyTraceEdit = (spec: TraceSpec, edit: TraceEdit | undefined): TraceSpec => {
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

export function ChartCarousel({ insights, sessionId, onDelete, schema = null }: ChartCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [insightEdits, setInsightEdits] = useState<Record<string, InsightEdit>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [activeTrace, setActiveTrace] = useState(0)
  const [combineOpen, setCombineOpen] = useState(false)
  const [combineSelection, setCombineSelection] = useState<Set<string>>(new Set())
  const [isRebuilding, setIsRebuilding] = useState(false)
  const [chartModulesReady, setChartModulesReady] = useState(false)

  const next = useCallback(() => {
    setActiveIndex((current) => (current + 1) % insights.length)
  }, [insights.length])

  const prev = useCallback(() => {
    setActiveIndex((current) => (current - 1 + insights.length) % insights.length)
  }, [insights.length])

  // All hooks must run before any conditional return (Rules of Hooks).
  const insight = insights[activeIndex] ?? null
  const edit = insight ? insightEdits[insight.id] ?? null : null
  const activePlotlyData = edit?.plotlyData ?? insight?.chart_spec.plotlyData ?? null
  const activePlotlyLayout = edit?.plotlyLayout ?? insight?.chart_spec.plotlyLayout ?? null
  const originalTraces = insight?.chart_spec.traces ?? []
  const originalChartType = originalTraces[0]?.chart_type ?? null
  const currentChartType = edit?.chartType ?? originalChartType
  const plotLayout = useMemo(
    () => ({ ...(activePlotlyLayout as Partial<Plotly.Layout>), autosize: true }),
    [activePlotlyLayout]
  )

  const traceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          ((activePlotlyData as Array<{ type?: string }> | null) ?? [])
            .map((trace) => trace?.type)
            .filter((type): type is string => Boolean(type))
        )
      ),
    [activePlotlyData]
  )

  useEffect(() => {
    let cancelled = false
    setChartModulesReady(false)
    ensureTraceModules(traceTypes).then(() => {
      if (!cancelled) {
        setChartModulesReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [traceTypes])

  // reset the editor when navigating between insights
  useEffect(() => {
    setEditorOpen(false)
    setActiveTrace(0)
  }, [insight?.id])

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

  if (insights.length === 0 || !insight) {
    return null
  }

  const showStaticChart = edit?.staticSvg !== null && edit?.staticSvg !== undefined
    || (insight.chart_spec.isStatic === true && edit === null)

  const staticSrc = edit?.staticSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(edit.staticSvg)}`
    : insightSvgUrl(sessionId, insight.id)

  const applyEditResult = (chartType: string, traceEdits: Record<number, TraceEdit>, result: EditChartResult) => {
    setInsightEdits((current) => ({
      ...current,
      [insight.id]: {
        chartType,
        traceEdits,
        plotlyData: result.plotlyData,
        plotlyLayout: result.plotlyLayout,
        staticSvg: result.isStatic ? result.staticSvg : null,
      },
    }))
  }

  const buildEditedTraces = (chartType: string, traceEdits: Record<number, TraceEdit>): TraceSpec[] =>
    originalTraces.map((spec, index) => {
      const edited = applyTraceEdit(spec, traceEdits[index])
      return {
        ...edited,
        chart_type: spec.chart_type === originalChartType ? chartType : spec.chart_type,
      }
    })

  const undoEdit = () => {
    setInsightEdits((current) => {
      const nextEdits = { ...current }
      delete nextEdits[insight.id]
      return nextEdits
    })
  }

  const rebuild = async (chartType: string, traceEdits: Record<number, TraceEdit>) => {
    if (!sessionId) return
    setIsRebuilding(true)
    try {
      const result = await editChart(sessionId, buildEditedTraces(chartType, traceEdits))
      applyEditResult(chartType, traceEdits, result)
    } catch {
      // The selects snap back on their own: values only change when an
      // edit is actually stored.
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
        filter: {
          field: schemaFields[0]?.jsonPath ?? effectiveTrace.x_axis,
          op: 'eq',
          value: '',
        },
      })
    } else {
      handleTraceEdit({ filter: null })
    }
  }

  const handleCombine = async () => {
    if (!sessionId || combineSelection.size < 2) return

    setIsRebuilding(true)
    try {
      const traces: TraceSpec[] = Array.from(combineSelection).map((id) => {
        const selectedInsight = insights.find((i) => i.id === id)
        return {
          chart_type: 'bar',
          x_axis: '$.x',
          y_axis: '$.y',
          name: selectedInsight?.metadata.title ?? id,
        }
      })
      const result = await editChart(sessionId, traces)
      applyEditResult(currentChartType ?? 'bar', edit?.traceEdits ?? {}, result)
      setCombineOpen(false)
    } catch {
    } finally {
      setIsRebuilding(false)
    }
  }

  const toggleCombineSelection = (id: string) => {
    setCombineSelection((current) => {
      const nextSelection = new Set(current)
      if (nextSelection.has(id)) {
        nextSelection.delete(id)
      } else {
        nextSelection.add(id)
      }
      return nextSelection
    })
  }

  const hasFieldEditor = Boolean(sessionId) && schemaFields.length > 0
  const rawFilter = effectiveTrace?.filter ?? null
  const effectiveFilter = rawFilter
    ? { field: rawFilter.field, op: rawFilter.op, value: filterValueAsString(rawFilter.value) }
    : null

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Insight Candidates</Title>
          <Text c="dimmed" size="sm">
            {activeIndex + 1} of {insights.length} — interactive chart cards generated from your data.
          </Text>
        </div>
        {insights.length > 1 ? (
          <Group gap="xs">
            <Button
              variant="light"
              size="sm"
              onClick={() => {
                setCombineSelection(new Set([insight.id]))
                setCombineOpen(true)
              }}
            >
              Combine charts
            </Button>
            <Button variant="default" size="sm" onClick={prev}>
              &#8592;
            </Button>
            <Button variant="default" size="sm" onClick={next}>
              &#8594;
            </Button>
          </Group>
        ) : null}
      </Group>

      <Card
        data-testid="chart-card"
        withBorder
        radius="lg"
        padding="lg"
        className="bg-gray-900/50 backdrop-blur-sm shadow-lg border-gray-700/50"
      >
        <Stack gap="md">
          <Title order={4}>{insight.metadata.title}</Title>
          <Text c="dimmed" size="sm">{insight.metadata.summary}</Text>

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
              {hasFieldEditor ? (
                <Button
                  variant={editorOpen ? 'filled' : 'light'}
                  size="compact-sm"
                  onClick={() => setEditorOpen((open) => !open)}
                  mb={3}
                >
                  Edit fields
                </Button>
              ) : null}
              {edit ? (
                <ActionIcon
                  variant="subtle"
                  aria-label="Undo chart edit"
                  title="Undo chart edit"
                  onClick={undoEdit}
                  mb={3}
                >
                  &#8630;
                </ActionIcon>
              ) : null}
            </Group>
          ) : null}

          {editorOpen && hasFieldEditor && effectiveTrace ? (
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
                        value && handleTraceEdit({
                          filter: { ...effectiveFilter, field: value },
                        })
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
                        value && handleTraceEdit({
                          filter: { ...effectiveFilter, op: value },
                        })
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
                        handleTraceEdit({
                          filter: { ...effectiveFilter, value: event.currentTarget.value },
                        })
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

          {showStaticChart ? (
            <Stack gap="xs">
              <img
                src={staticSrc}
                alt={`${insight.metadata.title} (static preview)`}
                style={{ width: '100%', height: 'auto' }}
              />
              <Badge variant="light" color="grape" w="fit-content">
                Static preview — dataset exceeds the interactive-rendering limit
              </Badge>
            </Stack>
          ) : chartModulesReady ? (
            <Plot
              data={activePlotlyData as Plotly.Data[]}
              layout={plotLayout}
              config={PLOT_CONFIG}
              style={PLOT_STYLE}
              useResizeHandler
            />
          ) : (
            <Skeleton height={400} radius="md" />
          )}

          <Group justify="flex-end">
            <Button color="red" variant="light" type="button" onClick={() => onDelete(insight.id)}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Card>

      {insights.length > 1 ? (
        <Group justify="center" gap="xs">
          {insights.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setActiveIndex(index)}
              className="inline-block rounded-full transition-all"
              style={{
                width: index === activeIndex ? '24px' : '8px',
                height: '8px',
                backgroundColor: index === activeIndex ? '#228be6' : '#ced4da',
                border: 'none',
                cursor: 'pointer'
              }}
              aria-label={`Go to chart ${index + 1}`}
            />
          ))}
        </Group>
      ) : null}

      {combineOpen ? (
        <Modal
          opened={combineOpen}
          onClose={() => setCombineOpen(false)}
          title="Combine charts"
          size="md"
          keepMounted={false}
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Select insights to combine into a single chart with multiple traces.
            </Text>
            {insights.map((i) => (
              <Checkbox
                key={i.id}
                label={i.metadata.title}
                checked={combineSelection.has(i.id)}
                onChange={() => toggleCombineSelection(i.id)}
              />
            ))}
            <Group justify="flex-end" mt="md">
              <Button
                onClick={handleCombine}
                disabled={combineSelection.size < 2 || isRebuilding}
                loading={isRebuilding}
              >
                Combine ({combineSelection.size} selected)
              </Button>
            </Group>
          </Stack>
        </Modal>
      ) : null}
    </Stack>
  )
}
