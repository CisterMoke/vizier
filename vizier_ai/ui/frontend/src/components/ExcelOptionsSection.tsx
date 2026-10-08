import { Group, TextInput } from '@mantine/core'
import { Switch } from '@mantine/core'
import { Stack } from '@mantine/core'
import { CollapsibleSection } from './CollapsibleSection'
import type { ExcelOptionsState } from '../domain/excel'

interface ExcelOptionsSectionProps {
  value: ExcelOptionsState
  onChange: (state: ExcelOptionsState) => void
  disabled?: boolean
}

export function ExcelOptionsSection({ value, onChange, disabled }: ExcelOptionsSectionProps) {
  const set = (patch: Partial<ExcelOptionsState>) => onChange({ ...value, ...patch })

  return (
    <CollapsibleSection label="Excel options" description="Sheet, header row, rows to skip">
      <Stack gap="sm">
        <Group gap="sm" align="flex-end">
          <TextInput
            label="Sheet"
            placeholder="First sheet"
            description="Name or 0-based index; empty uses the first sheet"
            value={value.sheetName}
            onInput={(event) => set({ sheetName: (event.target as HTMLInputElement).value })}
            disabled={disabled}
            w={240}
          />
          <TextInput
            label="Rows to skip"
            value={String(value.skipRows)}
            onInput={(event) => {
              const parsed = parseInt((event.target as HTMLInputElement).value, 10)
              set({ skipRows: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) })
            }}
            disabled={disabled}
            w={140}
          />
        </Group>
        <Switch
          label="First row contains column names"
          checked={value.header}
          onChange={(event) => set({ header: event.currentTarget.checked })}
          disabled={disabled}
        />
      </Stack>
    </CollapsibleSection>
  )
}
