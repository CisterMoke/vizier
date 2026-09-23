import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { ChartErrorBoundary } from './ChartErrorBoundary'

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('plotly exploded')
  }
  return <div data-testid="chart-content">charts</div>
}

const renderBoundary = (shouldThrow: boolean) =>
  render(
    <MantineProvider>
      <ChartErrorBoundary>
        <Bomb shouldThrow={shouldThrow} />
      </ChartErrorBoundary>
    </MantineProvider>
  )

describe('ChartErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    renderBoundary(false)

    expect(screen.getByTestId('chart-content')).toBeInTheDocument()
  })

  it('shows a fallback with the error message instead of crashing the app', () => {
    renderBoundary(true)

    expect(screen.getByText(/chart rendering failed/i)).toBeInTheDocument()
    expect(screen.getByText(/plotly exploded/i)).toBeInTheDocument()
    expect(screen.queryByTestId('chart-content')).not.toBeInTheDocument()
  })

  it('recovers when retry is clicked and the child renders cleanly', () => {
    const Toggle = () => {
      const [throwing, setThrowing] = useState(true)
      return (
        <div>
          <ChartErrorBoundary>
            <Bomb shouldThrow={throwing} />
          </ChartErrorBoundary>
          <button type="button" onClick={() => setThrowing(false)}>stop throwing</button>
        </div>
      )
    }

    render(<MantineProvider><Toggle /></MantineProvider>)

    expect(screen.getByText(/chart rendering failed/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByText(/chart rendering failed/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /stop throwing/i }))
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(screen.getByTestId('chart-content')).toBeInTheDocument()
  })
})
