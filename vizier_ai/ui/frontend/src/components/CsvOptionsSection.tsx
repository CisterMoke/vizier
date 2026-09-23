import { Group, Select, Stack, Switch, TextInput } from '@mantine/core'
import { CollapsibleSection } from './CollapsibleSection'
import type { CsvOptionsState } from '../domain/csv'

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma ( , )' },
  { value: ';', label: 'Semicolon ( ; )' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe ( | )' },
  { value: 'custom', label: 'Custom…' },
]

const ENCODING_OPTIONS = ['utf-8', 'latin-1', 'windows-1252', 'utf-16']

interface CsvOptionsSectionProps {
  value: CsvOptionsState
  onChange: (state: CsvOptionsState) => void
  disabled?: boolean
}

export function CsvOptionsSection({ value, onChange, disabled }: CsvOptionsSectionProps) {
  const set = (patch: Partial<CsvOptionsState>) => onChange({ ...value, ...patch })

  return (
    <CollapsibleSection label="CSV options" description="Tune how the file is parsed">
      <Stack gap="sm">
        <Group gap="sm" align="flex-end">
          <Select
            label="Delimiter"
            data={DELIMITER_OPTIONS}
            value={value.delimiter}
            onChange={(delimiter) => set({ delimiter: delimiter ?? ',' })}
            disabled={disabled}
            w={180}
          />
          {value.delimiter === 'custom' ? (
            <TextInput
              label="Custom delimiter"
              placeholder="e.g. #"
              value={value.customDelimiter}
              onInput={(event) => set({ customDelimiter: (event.target as HTMLInputElement).value })}
              disabled={disabled}
              w={140}
            />
          ) : null}
          <TextInput
            label="Quote character"
            value={value.quoteChar}
            onInput={(event) => set({ quoteChar: (event.target as HTMLInputElement).value })}
            disabled={disabled}
            w={140}
          />
        </Group>
        <Group gap="sm" align="flex-end">
          <TextInput
            label="Rows to skip"
            value={String(value.skipRows)}
            onInput={(event) => {
              const parsed = parseInt((event.target as HTMLInputElement).value, 10)
              set({ skipRows: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) })
            }}
            inputMode="numeric"
            disabled={disabled}
            w={140}
          />
          <Select
            label="Encoding"
            data={ENCODING_OPTIONS}
            value={value.encoding}
            onChange={(encoding) => set({ encoding: encoding ?? 'utf-8' })}
            disabled={disabled}
            w={180}
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
