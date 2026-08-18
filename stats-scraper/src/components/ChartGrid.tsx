import { SimpleGrid, Stack, Text, Title } from '@mantine/core'
import type { GeneratedDataset, InsightCandidate } from '../domain/types'
import { ChartCard } from './ChartCard'

interface ChartGridProps {
  insights: InsightCandidate[]
  datasetsByInsightId: Record<string, GeneratedDataset>
  onRegenerate: (insightId: string) => void
  onDelete: (insightId: string) => void
}

export function ChartGrid({ insights, datasetsByInsightId, onRegenerate, onDelete }: ChartGridProps) {
  if (insights.length === 0) {
    return null
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Insight Candidates</Title>
        <Text c="dimmed" size="sm">
          Interactive chart cards generated from your schema.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        {insights.map((insight) => {
          const dataset = datasetsByInsightId[insight.id]

          if (!dataset) {
            return null
          }

          return (
            <ChartCard
              key={insight.id}
              insight={insight}
              dataset={dataset}
              onRegenerate={onRegenerate}
              onDelete={onDelete}
            />
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}
