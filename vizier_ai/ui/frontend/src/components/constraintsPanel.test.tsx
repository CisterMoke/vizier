import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { ConstraintsPanel } from './ConstraintsPanel'
import { EMPTY_CONSTRAINTS, type ConstraintsState } from '../domain/constraints'

const renderWithMantine = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

const baseState: ConstraintsState = {
  ...EMPTY_CONSTRAINTS,
  includeChartTypes: ['bar'],
  guidance: 'compare regions',
}

describe('ConstraintsPanel', () => {
  it('renders all constraint inputs', () => {
    renderWithMantine(<ConstraintsPanel value={EMPTY_CONSTRAINTS} onChange={() => {}} />)

    expect(screen.getByLabelText(/chart types to include/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/chart types to exclude/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/fields to include/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/fields to exclude/i, { selector: 'input' })).toBeInTheDocument()
    expect(screen.getByLabelText(/guidance/i)).toBeInTheDocument()
  })

  it('fires onChange with updated guidance while preserving other constraints', () => {
    const onChange = vi.fn()
    renderWithMantine(<ConstraintsPanel value={baseState} onChange={onChange} />)

    fireEvent.input(screen.getByLabelText(/guidance/i), {
      target: { value: 'focus on trends' }
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      ...baseState,
      guidance: 'focus on trends'
    })
  })

  it('disables chart type exclude when includes are set', () => {
    renderWithMantine(<ConstraintsPanel value={baseState} onChange={() => {}} />)

    expect(screen.getByLabelText(/chart types to exclude/i, { selector: 'input' })).toBeDisabled()
    expect(screen.getByLabelText(/chart types to include/i, { selector: 'input' })).not.toBeDisabled()
  })

  it('disables chart type include when excludes are set', () => {
    const state: ConstraintsState = { ...EMPTY_CONSTRAINTS, excludeChartTypes: ['pie'] }
    renderWithMantine(<ConstraintsPanel value={state} onChange={() => {}} />)

    expect(screen.getByLabelText(/chart types to include/i, { selector: 'input' })).toBeDisabled()
    expect(screen.getByLabelText(/chart types to exclude/i, { selector: 'input' })).not.toBeDisabled()
  })

  it('disables field exclude when field includes are set', () => {
    const state: ConstraintsState = { ...EMPTY_CONSTRAINTS, includeFields: ['county'] }
    renderWithMantine(<ConstraintsPanel value={state} onChange={() => {}} />)

    expect(screen.getByLabelText(/fields to exclude/i, { selector: 'input' })).toBeDisabled()
  })

  it('renders the current guidance value', () => {
    renderWithMantine(<ConstraintsPanel value={baseState} onChange={() => {}} />)

    expect(screen.getByLabelText(/guidance/i)).toHaveValue('compare regions')
  })
})
