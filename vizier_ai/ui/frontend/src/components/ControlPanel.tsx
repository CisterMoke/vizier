import { Badge, Button, FileInput, Group, Modal, Paper, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core'
import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { fetchConfig, type ServerConfig } from '../services/apiClient'
import type { ConstraintsState } from '../domain/constraints'
import { EMPTY_CONSTRAINTS } from '../domain/constraints'
import { buildCsvOptionsPayload, DEFAULT_CSV_OPTIONS, type CsvOptionsState } from '../domain/csv'
import { buildExcelOptionsPayload, DEFAULT_EXCEL_OPTIONS, type ExcelOptionsState } from '../domain/excel'
import type { DataSourceMode, FileFormat, GenerateRequest, RestApiConfig, SqlConfig } from '../domain/types'
import { useWorkspace } from '../store/workspace'
import { CollapsibleSection } from './CollapsibleSection'
import { ConstraintsPanel } from './ConstraintsPanel'
import { CsvOptionsSection } from './CsvOptionsSection'
import { ExcelOptionsSection } from './ExcelOptionsSection'

interface ControlPanelProps {
  isGenerating: boolean
  isRegenerating: boolean
  hasRealData: boolean
  constraints: ConstraintsState
  onConstraintsChange: (state: ConstraintsState) => void
  onGenerate: (request: GenerateRequest) => Promise<void>
  onRegenerate: () => void
}

const inferDataFormat = (filename: string): FileFormat => {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.jsonl')) return 'jsonl'
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel'
  if (lower.endsWith('.json')) return 'json'
  return 'csv'
}

export function ControlPanel({
  isGenerating,
  isRegenerating,
  hasRealData,
  constraints,
  onConstraintsChange,
  onGenerate,
  onRegenerate,
}: ControlPanelProps) {
  const { locked, resetWorkspace } = useWorkspace()
  const [schemaText, setSchemaText] = useState('')
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('none')
  const [file, setFile] = useState<File | null>(null)
  const [fileFormat, setFileFormat] = useState<FileFormat>('csv')
  const [restConfig, setRestConfig] = useState<RestApiConfig>({ method: 'GET', url: '', headers: '', body: '' })
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>({ connectionString: '', query: '' })
  const [fileError, setFileError] = useState<string | null>(null)
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [csvOptions, setCsvOptions] = useState<CsvOptionsState>(DEFAULT_CSV_OPTIONS)
  const [excelOptions, setExcelOptions] = useState<ExcelOptionsState>(DEFAULT_EXCEL_OPTIONS)
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {})
  }, [])

  const maxFileSizeBytes = config?.maxFileSize ?? 0
  const maxRows = config?.maxRows ?? null
  const inputsDisabled = isGenerating || locked

  const handleFileUpload = (uploadedFile: File | null) => {
    setFileError(null)

    if (!uploadedFile) {
      setFile(null)
      return
    }

    if (maxFileSizeBytes > 0 && uploadedFile.size > maxFileSizeBytes) {
      const sizeMB = uploadedFile.size / (1024 * 1024)
      const maxMB = maxFileSizeBytes / (1024 * 1024)
      setFileError(`File too large (${sizeMB.toFixed(1)} MB). Max ${maxMB.toFixed(0)} MB.`)
      setFile(null)
      return
    }

    setFile(uploadedFile)
    setFileFormat(inferDataFormat(uploadedFile.name))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (schemaText.trim().length === 0) return

    await onGenerate({
      schemaText,
      dataSource: {
        mode: dataSourceMode,
        file: dataSourceMode === 'file' ? (file ?? undefined) : undefined,
        fileFormat,
        rest: dataSourceMode === 'rest' ? restConfig : undefined,
        sql: dataSourceMode === 'sql' ? sqlConfig : undefined
      },
      csvOptions: dataSourceMode === 'file' && fileFormat === 'csv'
        ? buildCsvOptionsPayload(csvOptions)
        : undefined,
      excelOptions: dataSourceMode === 'file' && fileFormat === 'excel'
        ? buildExcelOptionsPayload(excelOptions)
        : undefined
    })
  }

  const handleResetConfirm = () => {
    setSchemaText('')
    setDataSourceMode('none')
    setFile(null)
    setFileError(null)
    setRestConfig({ method: 'GET', url: '', headers: '', body: '' })
    setSqlConfig({ connectionString: '', query: '' })
    setCsvOptions(DEFAULT_CSV_OPTIONS)
    setExcelOptions(DEFAULT_EXCEL_OPTIONS)
    resetWorkspace()
    setResetOpen(false)
  }

  return (
    <Paper withBorder radius="lg" p="lg" className="bg-gray-900/50 backdrop-blur-sm shadow-sm border-gray-700/50">
      <Stack gap="md">
        <div>
          <Title order={3}>Studio workspace</Title>
          <Text c="dimmed" size="sm">
            Describe your data, generate insights, and arrange them in the mosaic.
          </Text>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <Stack gap="md">
            <Textarea
              label="Data description"
              id="schema-input"
              minRows={4}
              autosize
              placeholder="Describe your dataset in words, provide a schema and/or a few sample rows. E.g. 'This dataset is obtained from the WA State DOL and contains EV registration records with fields like county, make, model, electric_range...'"
              value={schemaText}
              disabled={inputsDisabled}
              onInput={(event) => setSchemaText((event.target as HTMLTextAreaElement).value)}
            />

            <Select
              label="Real data source"
              data={[
                { value: 'none', label: 'None (use mock data)' },
                { value: 'file', label: 'File upload' },
                { value: 'rest', label: 'REST API' },
                { value: 'sql', label: 'SQL query' }
              ]}
              value={dataSourceMode}
              disabled={inputsDisabled}
              onChange={(value) => setDataSourceMode((value as DataSourceMode) ?? 'none')}
            />

            {dataSourceMode === 'file' ? (
              <Stack gap="sm">
                <Group gap="md" align="flex-end">
                  <FileInput
                    label="Upload data file"
                    placeholder="Choose file"
                    value={file}
                    onChange={handleFileUpload}
                    accept=".csv,.json,.jsonl,.xlsx,.xls,.txt"
                    disabled={inputsDisabled}
                    style={{ flex: 1 }}
                  />
                  <Select
                    label="Format"
                    data={[
                      { value: 'csv', label: 'CSV' },
                      { value: 'json', label: 'JSON array' },
                      { value: 'jsonl', label: 'JSONL' },
                      { value: 'excel', label: 'Excel' }
                    ]}
                    value={fileFormat}
                    onChange={(value) => setFileFormat((value as FileFormat) ?? 'csv')}
                    disabled={inputsDisabled}
                    w={140}
                  />
                </Group>
                {file ? (
                  <Text c="green" size="sm">
                    Loaded: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </Text>
                ) : null}
                {fileError ? (
                  <Text c="red" size="sm">{fileError}</Text>
                ) : null}
                <Text c="dimmed" size="xs">
                  {maxFileSizeBytes > 0
                    ? `Max ${(maxFileSizeBytes / (1024 * 1024)).toFixed(0)} MB. `
                    : ''}
                  {maxRows !== null
                    ? `Large files are automatically sampled to the first ${maxRows} rows.`
                    : ''}
                </Text>
                {fileFormat === 'csv' ? (
                  <CsvOptionsSection value={csvOptions} onChange={setCsvOptions} disabled={inputsDisabled} />
                ) : null}
                {fileFormat === 'excel' ? (
                  <ExcelOptionsSection value={excelOptions} onChange={setExcelOptions} disabled={inputsDisabled} />
                ) : null}
              </Stack>
            ) : null}

            {dataSourceMode === 'rest' ? (
              <Stack gap="sm">
                <Group gap="md">
                  <Select
                    label="Method"
                    data={['GET', 'POST', 'PUT', 'PATCH', 'DELETE']}
                    value={restConfig.method}
                    onChange={(value) => setRestConfig((c) => ({ ...c, method: value ?? 'GET' }))}
                    disabled={inputsDisabled}
                    w={120}
                  />
                  <TextInput
                    label="URL"
                    placeholder="https://api.example.com/data"
                    style={{ flex: 1 }}
                    value={restConfig.url}
                    disabled={inputsDisabled}
                    onInput={(event) => setRestConfig((c) => ({ ...c, url: (event.target as HTMLInputElement).value }))}
                  />
                </Group>
                <Textarea
                  label="Headers (JSON)"
                  placeholder='{"Authorization": "Bearer ..."}'
                  minRows={2}
                  autosize
                  value={restConfig.headers}
                  disabled={inputsDisabled}
                  onInput={(event) => setRestConfig((c) => ({ ...c, headers: (event.target as HTMLTextAreaElement).value }))}
                />
                <Textarea
                  label="Body"
                  placeholder='{"query": "..."}'
                  minRows={2}
                  autosize
                  value={restConfig.body}
                  disabled={inputsDisabled}
                  onInput={(event) => setRestConfig((c) => ({ ...c, body: (event.target as HTMLTextAreaElement).value }))}
                />
              </Stack>
            ) : null}

            {dataSourceMode === 'sql' ? (
              <Stack gap="sm">
                <TextInput
                  label="Connection string"
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  value={sqlConfig.connectionString}
                  disabled={inputsDisabled}
                  onInput={(event) => setSqlConfig((c) => ({ ...c, connectionString: (event.target as HTMLInputElement).value }))}
                />
                <Textarea
                  label="SQL query"
                  placeholder="SELECT * FROM orders LIMIT 100"
                  minRows={3}
                  autosize
                  value={sqlConfig.query}
                  disabled={inputsDisabled}
                  onInput={(event) => setSqlConfig((c) => ({ ...c, query: (event.target as HTMLTextAreaElement).value }))}
                />
              </Stack>
            ) : null}

            <CollapsibleSection
              label="Advanced options"
              description="Nudge the model: chart types, fields, and free-form guidance."
            >
              <ConstraintsPanel
                value={constraints ?? EMPTY_CONSTRAINTS}
                onChange={onConstraintsChange}
                disabled={isGenerating || isRegenerating}
              />
            </CollapsibleSection>

            {locked ? (
              <Text c="dimmed" size="sm">
                Insights exist — reset the workspace to load new data.
              </Text>
            ) : null}

            <Group gap="md" justify="flex-end">
              {hasRealData ? (
                <Badge variant="light" color="green" size="sm">Real data</Badge>
              ) : null}
              {locked ? (
                <>
                  <Button
                    variant="light"
                    loading={isRegenerating}
                    disabled={isRegenerating || isGenerating}
                    onClick={onRegenerate}
                  >
                    {isRegenerating ? 'Regenerating...' : 'Regenerate insights'}
                  </Button>
                  <Button color="red" variant="light" type="button" onClick={() => setResetOpen(true)}>
                    Reset workspace
                  </Button>
                </>
              ) : null}
              <Button type="submit" loading={isGenerating} disabled={inputsDisabled}>
                {isGenerating ? 'Analyzing & generating...' : 'Generate insights'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>

      <Modal
        opened={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset workspace?"
        size="sm"
        keepMounted={false}
      >
        <Stack gap="md">
          <Text size="sm">All insights, edits, and the mosaic layout will be cleared.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button color="red" onClick={handleResetConfirm}>Reset</Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  )
}
