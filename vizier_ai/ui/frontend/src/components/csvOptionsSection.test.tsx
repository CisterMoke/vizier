import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { CsvOptionsSection } from './CsvOptionsSection'
import { DEFAULT_CSV_OPTIONS, type CsvOptionsState } from '../domain/csv'

const renderSection = (state: CsvOptionsState, onChange: (s: CsvOptionsState) => void) =>
  render(
    <MantineProvider>
      <CsvOptionsSection value={state} onChange={onChange} />
    </MantineProvider>
  )

const openSection = () => {
  fireEvent.click(screen.getByRole('button', { name: /csv options/i }))
}

describe('CsvOptionsSection', () => {
  it('hides the option inputs until toggled open', () => {
    renderSection(DEFAULT_CSV_OPTIONS, () => {})

    expect(screen.getByRole('button', { name: /csv options/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/quote character/i)).not.toBeInTheDocument()

    openSection()

    expect(screen.getByLabelText(/quote character/i)).toBeInTheDocument()
  })

  it('renders all option inputs when open', () => {
    renderSection(DEFAULT_CSV_OPTIONS, () => {})
    openSection()

    expect(screen.getByLabelText(/delimiter/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/quote character/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first row contains column names/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rows to skip/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/encoding/i, { selector: 'input' })).toBeInTheDocument()
  })

  it('fires onChange with updated quote char while preserving state', () => {
    const onChange = vi.fn()
    renderSection(DEFAULT_CSV_OPTIONS, onChange)
    openSection()

    fireEvent.input(screen.getByLabelText(/quote character/i), {
      target: { value: "'" }
    })

    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_CSV_OPTIONS, quoteChar: "'" })
  })

  it('shows the custom delimiter input only for the custom choice', () => {
    const state: CsvOptionsState = { ...DEFAULT_CSV_OPTIONS, delimiter: 'custom' }
    renderSection(state, () => {})
    openSection()

    expect(screen.getByLabelText(/custom delimiter/i)).toBeInTheDocument()
  })
})
