import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ViewRail, type ViewItem } from './ViewRail'

const views: ViewItem[] = [
  { id: 'studio', label: 'Studio', icon: <span>St</span> },
  { id: 'sandbox', label: 'Sandbox', icon: <span>Sb</span>, disabled: true },
]

const renderRail = (onSelect?: (id: string) => void) =>
  render(
    <MantineProvider>
      <ViewRail views={views} activeView="studio" onSelect={onSelect} />
    </MantineProvider>
  )

it('renders the brand and all views, collapsed by default', () => {
  renderRail()
  expect(screen.getByText('V')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /studio/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /sandbox/i })).toBeInTheDocument()
  expect(screen.getByRole('navigation').dataset.expanded).toBe('false')
})

it('expands on item interaction and collapses when focus leaves the rail', async () => {
  renderRail()
  const nav = screen.getByRole('navigation')
  const studio = screen.getByRole('button', { name: /studio/i }) as HTMLButtonElement
  studio.focus()
  fireEvent.click(studio)
  expect(nav.dataset.expanded).toBe('true')
  expect(screen.getByText('Vizier')).toBeInTheDocument()
  studio.blur()
  await waitFor(() => expect(nav.dataset.expanded).toBe('false'))
})

it('collapses when clicking outside the rail', async () => {
  renderRail()
  const nav = screen.getByRole('navigation')
  const studio = screen.getByRole('button', { name: /studio/i }) as HTMLButtonElement
  studio.focus()
  fireEvent.click(studio)
  await waitFor(() => expect(nav.dataset.expanded).toBe('true'))

  fireEvent.mouseDown(document.body)
  await waitFor(() => expect(nav.dataset.expanded).toBe('false'))
})

it('marks the active view and calls onSelect only for enabled items', () => {
  const onSelect = vi.fn()
  renderRail(onSelect)
  const sandbox = screen.getByRole('button', { name: /sandbox/i }) as HTMLButtonElement
  expect(sandbox).toHaveAttribute('aria-disabled', 'true')
  sandbox.focus()
  fireEvent.click(sandbox)
  expect(onSelect).not.toHaveBeenCalled()

  const studio = screen.getByRole('button', { name: /studio/i }) as HTMLButtonElement
  studio.focus()
  fireEvent.click(studio)
  expect(onSelect).toHaveBeenCalledWith('studio')
})
