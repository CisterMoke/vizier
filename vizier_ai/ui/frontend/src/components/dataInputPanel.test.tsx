import { fireEvent, render, screen, waitFor } from '@testing-library/preact'
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

it('renders the load bundle section', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onImportBundle = vi.fn().mockResolvedValue(undefined)

  renderWithMantine(
    <DataInputPanel onGenerate={onGenerate} isGenerating={false} onImportBundle={onImportBundle} />
  )

  expect(screen.getByLabelText(/saved bundle file/i)).toBeInTheDocument()
  expect(screen.getByLabelText(/attach data file \(optional\)/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /load bundle/i })).toBeDisabled()
})

it('calls onImportBundle with the selected files', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  const onImportBundle = vi.fn().mockResolvedValue(undefined)

  renderWithMantine(
    <DataInputPanel onGenerate={onGenerate} isGenerating={false} onImportBundle={onImportBundle} />
  )

  const bundleFile = new File(['{}'], 'bundle.json', { type: 'application/json' })
  const dataFile = new File(['county\nKing'], 'data.csv', { type: 'text/csv' })

  selectFile(bundleInput(), bundleFile)
  selectFile(bundleDataInput(), dataFile)

  const loadButton = screen.getByRole('button', { name: /load bundle/i })
  await waitFor(() => expect(loadButton).not.toBeDisabled())

  fireEvent.click(loadButton)

  await waitFor(() => expect(onImportBundle).toHaveBeenCalledTimes(1))
  expect(onImportBundle.mock.calls[0][0]).toBe(bundleFile)
  expect(onImportBundle.mock.calls[0][1]).toBe(dataFile)
})
