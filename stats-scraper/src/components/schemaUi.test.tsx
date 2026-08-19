import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { SchemaInputPanel } from './SchemaInputPanel'

const renderWithMantine = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

it('submits data description through the generate callback', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<SchemaInputPanel onGenerate={onGenerate} isGenerating={false} />)

  fireEvent.input(screen.getByLabelText(/data description/i), {
    target: { value: 'orders(id int, total decimal)' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  expect(onGenerate).toHaveBeenCalledWith('orders(id int, total decimal)', undefined)
})

it('does not submit when textarea is empty', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderWithMantine(<SchemaInputPanel onGenerate={onGenerate} isGenerating={false} />)

  fireEvent.click(screen.getByRole('button', { name: /generate analytics/i }))

  expect(onGenerate).not.toHaveBeenCalled()
})
