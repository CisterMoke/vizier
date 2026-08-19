import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { DataInputPanel } from './DataInputPanel'
import type { GenerateRequest } from './DataInputPanel'

const renderWithMantine = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

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
