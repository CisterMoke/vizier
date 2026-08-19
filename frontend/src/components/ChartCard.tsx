import { Badge, Button, Card, Group, List, Stack, Text, Title } from '@mantine/core'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import PlotlyComponent from 'react-plotly.js'
import { buildPlotlySpec } from '../services/chartSpec'

const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

interface ChartCardProps {
  insight: InsightCandidate
  dataset: GeneratedDataset
  onRegenerate: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function ChartCard({ insight, dataset, onRegenerate, onDelete }: ChartCardProps) {
  const spec = buildPlotlySpec(insight, dataset)

  return (
    <Card
      data-testid="chart-card"
      withBorder
      radius="lg"
      padding="lg"
      className="bg-white/85 backdrop-blur-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <Stack gap="md">
        <div>
          <Group justify="space-between" align="flex-start">
            <Title order={4}>{insight.title}</Title>
            <Badge variant="light">{Math.round(insight.confidence * 100)}% confidence</Badge>
          </Group>
          <Text c="dimmed" size="sm" mt={4}>
            {insight.summary}
          </Text>
        </div>

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
            autosize: true,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            margin: { l: 32, r: 16, b: 40, t: 40 }
          }}
          config={{ responsive: true, displaylogo: false }}
          style={{ width: '100%', height: '320px' }}
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
  )
}
