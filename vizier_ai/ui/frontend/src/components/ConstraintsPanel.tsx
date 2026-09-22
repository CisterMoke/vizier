import { MultiSelect, Paper, Stack, TagsInput, Text, Textarea, Title } from '@mantine/core'
import type { ConstraintsState } from '../domain/constraints'

const CHART_TYPES = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'pie', label: 'Pie' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'geomap', label: 'Geo map' },
]

interface ConstraintsPanelProps {
  value: ConstraintsState
  onChange: (state: ConstraintsState) => void
  disabled?: boolean
}

export function ConstraintsPanel({ value, onChange, disabled }: ConstraintsPanelProps) {
  const set = (patch: Partial<ConstraintsState>) => onChange({ ...value, ...patch })

  return (
    <Paper withBorder radius="lg" p="lg" className="bg-gray-900/50 backdrop-blur-sm shadow-sm border-gray-700/50">
      <Stack gap="md">
        <div>
          <Title order={3}>Generation constraints</Title>
          <Text c="dimmed" size="sm">
            Optional nudges for the model. Chart types and fields are hard constraints — the model
            explains itself if they cannot be satisfied. Guidance is a soft hint.
          </Text>
        </div>

        <Stack gap="sm">
          <MultiSelect
            label="Chart types to include"
            description="Every generated trace will use one of these chart types"
            data={CHART_TYPES}
            value={value.includeChartTypes}
            onChange={(types) => set({ includeChartTypes: types })}
            disabled={disabled || value.excludeChartTypes.length > 0}
            placeholder="Any chart type"
            clearable
          />
          <MultiSelect
            label="Chart types to exclude"
            description="No generated trace will use these chart types"
            data={CHART_TYPES}
            value={value.excludeChartTypes}
            onChange={(types) => set({ excludeChartTypes: types })}
            disabled={disabled || value.includeChartTypes.length > 0}
            placeholder="No chart type excluded"
            clearable
          />
          <TagsInput
            label="Fields to include"
            description="Every insight will feature at least one of these fields (by name)"
            value={value.includeFields}
            onChange={(fields) => set({ includeFields: fields })}
            disabled={disabled || value.excludeFields.length > 0}
            placeholder="e.g. county"
            clearable
          />
          <TagsInput
            label="Fields to exclude"
            description="No trace will reference these fields (by name)"
            value={value.excludeFields}
            onChange={(fields) => set({ excludeFields: fields })}
            disabled={disabled || value.includeFields.length > 0}
            placeholder="e.g. id"
            clearable
          />
          <Textarea
            label="Guidance"
            description="Soft direction for the model (e.g. 'focus on trends', 'compare regions')"
            minRows={2}
            autosize
            value={value.guidance}
            onInput={(event) => set({ guidance: (event.target as HTMLTextAreaElement).value })}
            disabled={disabled}
          />
        </Stack>
      </Stack>
    </Paper>
  )
}
