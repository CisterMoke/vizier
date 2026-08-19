import { Button, Card, Group, Stack, Text, Title, Badge, List } from '@mantine/core'
import { useState, useCallback } from 'preact/hooks'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import PlotlyComponent from 'react-plotly.js'
import { buildPlotlySpec } from '../services/chartSpec'

const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

interface ChartCarouselProps {
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  onRegenerate: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function ChartCarousel({ insights, datasetsByInsightId, onRegenerate, onDelete }: ChartCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)

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
  const dataset = datasetsByInsightId[insight?.id ?? '']

  if (!insight || !dataset) {
    return null
  }

  const spec = buildPlotlySpec(insight, dataset)

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
          <Group justify="space-between" align="flex-start">
            <Title order={4}>{insight.title}</Title>
            <Badge variant="light">{Math.round(insight.confidence * 100)}% confidence</Badge>
          </Group>
          <Text c="dimmed" size="sm">{insight.summary}</Text>

          <Text size="sm">
            <strong>Hypothesis:</strong> {insight.hypothesis}
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

          <Text size="xs" c="dimmed">
            Data source: {dataset.name} ({dataset.rows.length} rows)
          </Text>

          <Plot
            data={spec.data}
            layout={{
              ...spec.layout,
              autosize: true
            }}
            config={{ responsive: true, displaylogo: false }}
            style={{ width: '100%', height: '400px' }}
            useResizeHandler
          />

          <Group justify="flex-end">
            <Button variant="default" type="button" onClick={() => onRegenerate(insight.id)}>
              Regenerate
            </Button>
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
    </Stack>
  )
}
