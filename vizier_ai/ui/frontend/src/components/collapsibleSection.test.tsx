import { fireEvent, render, screen } from '@testing-library/preact'
import { MantineProvider } from '@mantine/core'
import { CollapsibleSection } from './CollapsibleSection'

const renderSection = (node: JSX.Element) => render(<MantineProvider>{node}</MantineProvider>)

describe('CollapsibleSection', () => {
  it('renders a toggle button with the label and hides content by default', () => {
    renderSection(<CollapsibleSection label="Advanced options"><div data-testid="content">inner</div></CollapsibleSection>)

    const toggle = screen.getByRole('button', { name: /advanced options/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
  })

  it('toggles content on click', () => {
    renderSection(<CollapsibleSection label="Advanced options"><div data-testid="content">inner</div></CollapsibleSection>)

    fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
    expect(screen.getByRole('button', { name: /advanced options/i })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('content')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
    expect(screen.getByRole('button', { name: /advanced options/i })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('content')).not.toBeInTheDocument()
  })

  it('renders content initially when defaultOpened', () => {
    renderSection(
      <CollapsibleSection label="CSV options" defaultOpened>
        <div data-testid="content">inner</div>
      </CollapsibleSection>
    )

    expect(screen.getByTestId('content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /csv options/i })).toHaveAttribute('aria-expanded', 'true')
  })

  it('renders an optional description', () => {
    renderSection(
      <CollapsibleSection label="CSV options" description="Tune how the file is parsed">
        <div />
      </CollapsibleSection>
    )

    expect(screen.getByText(/tune how the file is parsed/i)).toBeInTheDocument()
  })
})
