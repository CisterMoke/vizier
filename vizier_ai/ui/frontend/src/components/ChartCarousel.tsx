import { ActionIcon, Badge, Button, Card, Group, Stack, Text, Title, Select, Modal, Checkbox, Skeleton } from '@mantine/core'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InsightCandidate, TraceSpec } from '../domain/types'
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

interface InsightEdit {
  chartType: string
  plotlyData: unknown[] | null
  plotlyLayout: Record<string, unknown> | null
  staticSvg: string | null
}

interface ChartCarouselProps {
  insights: InsightCandidate[]
  sessionId: string
  onDelete: (insightId: string) => void
}

export function ChartCarousel({ insights, sessionId, onDelete }: ChartCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [insightEdits, setInsightEdits] = useState<Record<string, InsightEdit>>({})
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
  const originalChartType = insight?.chart_spec.traces[0]?.chart_type ?? null
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

  if (insights.length === 0 || !insight) {
    return null
  }

  const showStaticChart = edit?.staticSvg !== null && edit?.staticSvg !== undefined
    || (insight.chart_spec.isStatic === true && edit === null)

  const staticSrc = edit?.staticSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(edit.staticSvg)}`
    : insightSvgUrl(sessionId, insight.id)

  const applyEditResult = (chartType: string, result: EditChartResult) => {
    setInsightEdits((current) => ({
      ...current,
      [insight.id]: {
        chartType,
        plotlyData: result.plotlyData,
        plotlyLayout: result.plotlyLayout,
        staticSvg: result.isStatic ? result.staticSvg : null,
      },
    }))
  }

  const undoEdit = () => {
    setInsightEdits((current) => {
      const nextEdits = { ...current }
      delete nextEdits[insight.id]
      return nextEdits
    })
  }

  const handleChartTypeChange = async (newType: string | null) => {
    if (!newType || !sessionId || newType === currentChartType) return

    setIsRebuilding(true)

    try {
      const newTraces: TraceSpec[] = insight.chart_spec.traces.map((spec) => ({
        ...spec,
        chart_type: spec.chart_type === originalChartType ? newType : spec.chart_type,
      }))
      const result = await editChart(sessionId, newTraces)
      applyEditResult(newType, result)
    } catch {
      // The select snaps back on its own: its value only changes when an
      // edit is actually stored.
    } finally {
      setIsRebuilding(false)
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
      applyEditResult(currentChartType ?? 'bar', result)
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

          <Text size="sm">
            <strong>Key idea:</strong> {insight.metadata.keyIdea}
          </Text>

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
