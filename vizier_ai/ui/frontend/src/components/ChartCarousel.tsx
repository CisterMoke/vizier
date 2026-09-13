import { Button, Card, Group, Stack, Text, Title, List, Select, Modal, Checkbox } from '@mantine/core'
import { useState, useCallback } from 'preact/hooks'
import type { InsightCandidate } from '../domain/types'
import PlotlyComponent from 'react-plotly.js'
import { editChart, type TraceSpec } from '../services/apiClient'

const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'geomap', label: 'Geo map' },
]

interface ChartCarouselProps {
  insights: InsightCandidate[]
  sessionId: string
  onDelete: (insightId: string) => void
}

export function ChartCarousel({ insights, sessionId, onDelete }: ChartCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [editingChartType, setEditingChartType] = useState<string | null>(null)
  const [combineOpen, setCombineOpen] = useState(false)
  const [combineSelection, setCombineSelection] = useState<Set<string>>(new Set())
  const [editedPlotlyData, setEditedPlotlyData] = useState<unknown[] | null>(null)
  const [editedPlotlyLayout, setEditedPlotlyLayout] = useState<Record<string, unknown> | null>(null)
  const [isRebuilding, setIsRebuilding] = useState(false)

  const next = useCallback(() => {
    setActiveIndex((current) => (current + 1) % insights.length)
  }, [insights.length])

  const prev = useCallback(() => {
    setActiveIndex((current) => (current - 1 + insights.length) % insights.length)
  }, [insights.length])

  if (insights.length === 0) {
    return null
  }

  const insight = insights[activeIndex]

  if (!insight) {
    return null
  }

  const activePlotlyData = editedPlotlyData ?? insight.plotlyData
  const activePlotlyLayout = editedPlotlyLayout ?? insight.plotlyLayout

  const handleChartTypeChange = async (newType: string | null) => {
    if (!newType || !sessionId || !insight) return

    setEditingChartType(newType)
    setIsRebuilding(true)

    try {
      const traces: TraceSpec[] = [
        {
          chartType: newType,
          xAxis: '$.x',
          yAxis: '$.y',
        }
      ]
      const result = await editChart(sessionId, traces)
      setEditedPlotlyData(result.plotlyData)
      setEditedPlotlyLayout(result.plotlyLayout)
    } catch {
      setEditingChartType(null)
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
          chartType: 'bar',
          xAxis: '$.x',
          yAxis: '$.y',
          name: selectedInsight?.title ?? id,
        }
      })
      const result = await editChart(sessionId, traces)
      setEditedPlotlyData(result.plotlyData)
      setEditedPlotlyLayout(result.plotlyLayout)
      setCombineOpen(false)
    } catch {
    } finally {
      setIsRebuilding(false)
    }
  }

  const toggleCombineSelection = (id: string) => {
    setCombineSelection((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
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
            {insights.length > 1 ? (
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
            ) : null}
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
          <Title order={4}>{insight.title}</Title>
          <Text c="dimmed" size="sm">{insight.summary}</Text>

          <Text size="sm">
            <strong>Key idea:</strong> {insight.keyIdea}
          </Text>
          <Text size="sm">
            <strong>Metric:</strong> {insight.metricDescription}
          </Text>

          {insight.assumptions.length > 0 ? (
            <List size="sm" withPadding>
              {insight.assumptions.map((assumption) => (
                <List.Item key={assumption}>{assumption}</List.Item>
              ))}
            </List>
          ) : null}

          {sessionId ? (
            <Select
              label="Chart type"
              data={CHART_TYPES}
              value={editingChartType}
              onChange={handleChartTypeChange}
              disabled={isRebuilding}
              size="sm"
              w={200}
            />
          ) : null}

          <Plot
            data={activePlotlyData as Plotly.Data[]}
            layout={{
              ...activePlotlyLayout as Partial<Plotly.Layout>,
              autosize: true
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: '100%', height: '400px' }}
            useResizeHandler
          />

          <Group justify="flex-end">
            {editedPlotlyData ? (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setEditedPlotlyData(null)
                  setEditedPlotlyLayout(null)
                  setEditingChartType(null)
                }}
              >
                Reset chart
              </Button>
            ) : null}
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
              onClick={() => {
                setActiveIndex(index)
                setEditedPlotlyData(null)
                setEditedPlotlyLayout(null)
                setEditingChartType(null)
              }}
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
                label={i.title}
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
