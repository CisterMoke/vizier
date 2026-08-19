import { Button, FileInput, Paper, Select, Stack, Text, Textarea, TextInput, Title, Group } from '@mantine/core'
import { useState } from 'preact/hooks'

export type DataSourceMode = 'none' | 'file' | 'rest' | 'sql'
export type FileFormat = 'csv' | 'json' | 'jsonl'

export interface RestApiConfig {
  method: string
  url: string
  headers: string
  body: string
}

export interface SqlConfig {
  connectionString: string
  query: string
}

export interface GenerateRequest {
  schemaText: string
  dataSource: {
    mode: DataSourceMode
    file?: File
    fileFormat?: FileFormat
    rest?: RestApiConfig
    sql?: SqlConfig
  }
}

interface DataInputPanelProps {
  onGenerate: (request: GenerateRequest) => Promise<void>
  onApplyData?: (request: GenerateRequest) => Promise<void>
  isGenerating: boolean
  isApplyingData?: boolean
  hasInsights?: boolean
}

const MAX_FILE_SIZE_MB = (import.meta.env.VITE_MAX_FILE_SIZE_MB as number) ?? 10

export function DataInputPanel({ onGenerate, onApplyData, isGenerating, isApplyingData, hasInsights }: DataInputPanelProps) {
  const [schemaText, setSchemaText] = useState('')
  const [dataSourceMode, setDataSourceMode] = useState<DataSourceMode>('none')
  const [file, setFile] = useState<File | null>(null)
  const [fileFormat, setFileFormat] = useState<FileFormat>('csv')
  const [restConfig, setRestConfig] = useState<RestApiConfig>({ method: 'GET', url: '', headers: '', body: '' })
  const [sqlConfig, setSqlConfig] = useState<SqlConfig>({ connectionString: '', query: '' })
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFileUpload = (uploadedFile: File | null) => {
    setFileError(null)

    if (!uploadedFile) {
      setFile(null)
      return
    }

    const sizeMB = uploadedFile.size / (1024 * 1024)
    if (sizeMB > MAX_FILE_SIZE_MB) {
      setFileError(`File too large (${sizeMB.toFixed(1)} MB). Max ${MAX_FILE_SIZE_MB} MB.`)
      setFile(null)
      return
    }

    setFile(uploadedFile)
  }

  const handleSubmit = async (event: Event) => {
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
      }
    })
  }

  return (
    <Paper withBorder radius="lg" p="lg" className="bg-gray-900/50 backdrop-blur-sm shadow-sm border-gray-700/50">
      <Stack gap="md">
        <div>
          <Title order={3}>Data Input</Title>
          <Text c="dimmed" size="sm">
            Paste a data description and optionally connect real data to visualize analytics instantly.
          </Text>
        </div>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <Textarea
              label="Data description"
              id="schema-input"
              minRows={4}
              autosize
              placeholder="Describe your dataset in words, provide a schema and/or a few sample rows. E.g. 'This dataset is obtained from the WA State DOL and contains EV registration records with fields like county, make, model, electric_range...'"
              value={schemaText}
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
                    accept=".csv,.json,.jsonl,.txt"
                    style={{ flex: 1 }}
                  />
                  <Select
                    label="Format"
                    data={[
                      { value: 'csv', label: 'CSV' },
                      { value: 'json', label: 'JSON array' },
                      { value: 'jsonl', label: 'JSONL' }
                    ]}
                    value={fileFormat}
                    onChange={(value) => setFileFormat((value as FileFormat) ?? 'csv')}
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
                  Max {MAX_FILE_SIZE_MB} MB. Large files are automatically sampled to the first 5000 rows.
                </Text>
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
                    w={120}
                  />
                  <TextInput
                    label="URL"
                    placeholder="https://api.example.com/data"
                    style={{ flex: 1 }}
                    value={restConfig.url}
                    onInput={(event) => setRestConfig((c) => ({ ...c, url: (event.target as HTMLInputElement).value }))}
                  />
                </Group>
                <Textarea
                  label="Headers (JSON)"
                  placeholder='{"Authorization": "Bearer ..."}'
                  minRows={2}
                  autosize
                  value={restConfig.headers}
                  onInput={(event) => setRestConfig((c) => ({ ...c, headers: (event.target as HTMLTextAreaElement).value }))}
                />
                <Textarea
                  label="Body"
                  placeholder='{"query": "..."}'
                  minRows={2}
                  autosize
                  value={restConfig.body}
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
                  onInput={(event) => setSqlConfig((c) => ({ ...c, connectionString: (event.target as HTMLInputElement).value }))}
                />
                <Textarea
                  label="SQL query"
                  placeholder="SELECT * FROM orders LIMIT 100"
                  minRows={3}
                  autosize
                  value={sqlConfig.query}
                  onInput={(event) => setSqlConfig((c) => ({ ...c, query: (event.target as HTMLTextAreaElement).value }))}
                />
              </Stack>
            ) : null}

            <Group gap="md">
              <Button type="submit" loading={isGenerating} disabled={isGenerating}>
                {isGenerating ? 'Analyzing & generating...' : 'Generate analytics'}
              </Button>
              {hasInsights && onApplyData && dataSourceMode !== 'none' ? (
                <Button
                  type="button"
                  variant="light"
                  loading={isApplyingData}
                  disabled={isApplyingData || isGenerating}
                  onClick={async (e) => {
                    e.preventDefault()
                    if (schemaText.trim().length === 0) return
                    await onApplyData({
                      schemaText,
                      dataSource: {
                        mode: dataSourceMode,
                        file: dataSourceMode === 'file' ? (file ?? undefined) : undefined,
                        fileFormat,
                        rest: dataSourceMode === 'rest' ? restConfig : undefined,
                        sql: dataSourceMode === 'sql' ? sqlConfig : undefined
                      }
                    })
                  }}
                >
                  {isApplyingData ? 'Applying data...' : 'Apply real data'}
                </Button>
              ) : null}
            </Group>
          </Stack>
        </form>
      </Stack>
    </Paper>
  )
}
