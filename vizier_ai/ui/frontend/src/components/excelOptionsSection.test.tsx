import { fireEvent, render, screen } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ExcelOptionsSection } from './ExcelOptionsSection'
import { DEFAULT_EXCEL_OPTIONS, type ExcelOptionsState } from '../domain/excel'

const renderSection = (state: ExcelOptionsState, onChange: (s: ExcelOptionsState) => void) =>
  render(
    <MantineProvider>
      <ExcelOptionsSection value={state} onChange={onChange} />
    </MantineProvider>
  )

const openSection = () => {
  fireEvent.click(screen.getByRole('button', { name: /excel options/i }))
}

describe('ExcelOptionsSection', () => {
  it('hides the option inputs until toggled open', () => {
    renderSection(DEFAULT_EXCEL_OPTIONS, () => {})

    expect(screen.queryByLabelText(/^sheet$/i)).not.toBeInTheDocument()

    openSection()

    expect(screen.getByLabelText(/^sheet$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rows to skip/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/first row contains column names/i)).toBeInTheDocument()
  })

  it('reports sheet changes', () => {
    const states: ExcelOptionsState[] = []
    renderSection(DEFAULT_EXCEL_OPTIONS, (s) => states.push(s))

    openSection()
    fireEvent.input(screen.getByLabelText(/^sheet$/i), { target: { value: 'Sales' } })

    expect(states.at(-1)?.sheetName).toBe('Sales')
  })

  it('toggles the header flag', () => {
    const states: ExcelOptionsState[] = []
    renderSection(DEFAULT_EXCEL_OPTIONS, (s) => states.push(s))

    openSection()
    fireEvent.click(screen.getByLabelText(/first row contains column names/i))

    expect(states.at(-1)?.header).toBe(false)
  })
})
