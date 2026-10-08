import { Stack, Text, Title } from '@mantine/core'

export function EmptyState() {
  return (
    <Stack gap="sm" mih="60vh" justify="center" align="center" className="text-center">
      <Title order={1}>Vizier AI</Title>
      <Text c="dimmed" maw={560}>
        Map any data source into a dataset schema, generate hypotheses, and visualize analytics instantly.
      </Text>
      <Text c="dimmed" size="sm" maw={560}>
        Describe your data in the panel on the left, optionally attach real data, then press
        Generate insights. Every run appends new charts here; drag or resize them to arrange your studio.
      </Text>
    </Stack>
  )
}
