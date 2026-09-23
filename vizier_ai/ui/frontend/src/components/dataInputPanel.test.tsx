import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { DataInputPanel } from './DataInputPanel'
import type { GenerateRequest } from './DataInputPanel'

const renderWithMantine = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

const selectFile = (input: HTMLElement, file: File) => {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const bundleInput = () =>
  document.querySelector('input[type="file"][name="bundle-file"]') as HTMLElement
const bundleDataInput = () =>
  document.querySelector('input[type="file"][name="bundle-data-file"]') as HTMLElement

it('submits data description through the generate callback', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<DataInputPanel onGenerate={onGenerate} isGenerating={false} />)

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  expect(onGenerate).toHaveBeenCalledTimes(1)
  const request = onGenerate.mock.calls[0][0] as GenerateRequest
  expect(request.schemaText).toBe('orders(id int, total decimal)')
  expect(request.dataSource.mode).toBe('none')
})

it('does not submit when textarea is empty', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<DataInputPanel onGenerate={onGenerate} isGenerating={false} />)

  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  expect(onGenerate).not.toHaveBeenCalled()
})

it('renders data source selector with all options', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<DataInputPanel onGenerate={onGenerate} isGenerating={false} />)

  expect(screen.getByText(/none \(use mock data\)/i)).toBeInTheDocument()
  expect(screen.getByText(/file upload/i)).toBeInTheDocument()
  expect(screen.getByText(/rest api/i)).toBeInTheDocument()
  expect(screen.getByText(/sql query/i)).toBeInTheDocument()
})

it('shows bundle load and reveals attach dataset once a bundle is picked', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onImportBundle = vi.fn().mockResolvedValue(undefined)

  renderWithMantine(
    <DataInputPanel onGenerate={onGenerate} isGenerating={false} onImportBundle={onImportBundle} />
  )

  expect(screen.getByLabelText(/load bundle/i)).toBeInTheDocument()
  expect(screen.queryByLabelText(/attach dataset/i)).not.toBeInTheDocument()

  selectFile(bundleInput(), new File(['{}'], 'bundle.json', { type: 'application/json' }))

  expect(await screen.findByLabelText(/attach dataset/i)).toBeInTheDocument()
})

it('calls onImportBundle with the selected files and inferred format', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onImportBundle = vi.fn().mockResolvedValue(undefined)

  renderWithMantine(
    <DataInputPanel onGenerate={onGenerate} isGenerating={false} onImportBundle={onImportBundle} />
  )

  const bundleFile = new File(['{}'], 'bundle.json', { type: 'application/json' })
  const dataFile = new File(['[{"county":"King"}]'], 'data.json', { type: 'application/json' })

  selectFile(bundleInput(), bundleFile)
  await screen.findByLabelText(/attach dataset/i)
  selectFile(bundleDataInput(), dataFile)

  fireEvent.click(await screen.findByRole('button', { name: /^load$/i }))

  await waitFor(() => expect(onImportBundle).toHaveBeenCalledTimes(1))
  expect(onImportBundle.mock.calls[0][0]).toBe(bundleFile)
  expect(onImportBundle.mock.calls[0][1]).toBe(dataFile)
  expect(onImportBundle.mock.calls[0][2]).toBe('json')
  expect(onImportBundle.mock.calls[0][3]).toBeUndefined()
})

it('shows csv options for the main upload when file mode and csv format are selected', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<DataInputPanel onGenerate={onGenerate} isGenerating={false} />)

  expect(screen.queryByRole('button', { name: /csv options/i })).not.toBeInTheDocument()

  const sourceSelect = screen.getByLabelText(/real data source/i, { selector: 'input' })
  fireEvent.click(sourceSelect)
  fireEvent.click(await screen.findByRole('option', { name: /file upload/i }))

  expect(await screen.findByRole('button', { name: /csv options/i })).toBeInTheDocument()
})

it('sends csv options with the generate request', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<DataInputPanel onGenerate={onGenerate} isGenerating={false} />)

  const sourceSelect = screen.getByLabelText(/real data source/i, { selector: 'input' })
  fireEvent.click(sourceSelect)
  fireEvent.click(await screen.findByRole('option', { name: /file upload/i }))

  fireEvent.click(await screen.findByRole('button', { name: /csv options/i }))
  fireEvent.input(screen.getByLabelText(/quote character/i), { target: { value: "'" } })

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
  const request = onGenerate.mock.calls[0][0] as GenerateRequest
  expect(request.dataSource.mode).toBe('file')
  expect(request.csvOptions).toEqual({ quote_char: "'" })
})

it('renders the advanced options inside the panel when a change handler is given', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onConstraintsChange = vi.fn()

  renderWithMantine(
    <DataInputPanel
      onGenerate={onGenerate}
      isGenerating={false}
      constraints={undefined}
      onConstraintsChange={onConstraintsChange}
    />
  )

  expect(screen.queryByLabelText(/guidance/i)).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
  fireEvent.input(screen.getByLabelText(/guidance/i), {
    target: { value: 'compare regions' }
  })

  expect(onConstraintsChange).toHaveBeenCalledTimes(1)
})

it('shows the regenerate button next to generate analytics when insights exist', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onRegenerate = vi.fn()

  renderWithMantine(
    <DataInputPanel
      onGenerate={onGenerate}
      isGenerating={false}
      hasInsights
      onRegenerate={onRegenerate}
    />
  )

  const generate = screen.getByRole('button', { name: /generate analytics/i })
  const regenerate = screen.getByRole('button', { name: /regenerate insights/i })
  expect(generate.parentElement).toBe(regenerate.parentElement)

  fireEvent.click(regenerate)
  expect(onRegenerate).toHaveBeenCalledTimes(1)
})
