import { fireEvent, render, screen } from '@testing-library/preact'
import { App } from './app'

vi.mock('react-plotly.js', () => ({
  default: () => <div data-testid="plotly-chart" />
}))

it('renders schema normalization studio shell', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: /schema normalization studio/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /normalize schema/i })).toBeInTheDocument()
})

it('renders in-memory llm controls with generate action', () => {
  render(<App />)

  expect(screen.getByLabelText(/llm api key/i)).toBeInTheDocument()
  const generateButton = screen.getByRole('button', { name: /generate insights/i })
  expect(generateButton).toBeInTheDocument()
  expect(generateButton).toBeDisabled()
})

it('generates fallback insights and enables report export without an api key', async () => {
  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: /normalize schema/i }))

  const generateButton = screen.getByRole('button', { name: /generate insights/i })
  expect(generateButton).toBeEnabled()

  fireEvent.click(generateButton)

  expect(await screen.findByRole('heading', { name: /insight candidates/i })).toBeInTheDocument()
  expect(screen.getAllByTestId('chart-card')).toHaveLength(3)
  expect(screen.getByRole('button', { name: /export report/i })).toBeInTheDocument()
})

it('falls back to offline insights when keyed provider request fails', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('bad request', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' }
    })
  )

  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: /normalize schema/i }))
  fireEvent.input(screen.getByLabelText(/llm api key/i), {
    target: { value: 'test-key' }
  })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))

  expect(await screen.findByRole('alert')).toHaveTextContent(/loaded offline fallback insights/i)

  fetchSpy.mockRestore()
})

it('exports report as a downloadable json artifact', async () => {
  const clickSpy = vi.fn()
  const originalCreateElement = document.createElement.bind(document)
  const originalCreateObjectUrl = URL.createObjectURL
  const originalRevokeObjectUrl = URL.revokeObjectURL

  URL.createObjectURL = vi.fn(() => 'blob:report')
  URL.revokeObjectURL = vi.fn()

  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName.toLowerCase() === 'a') {
      return {
        href: '',
        download: '',
        click: clickSpy
      } as unknown as HTMLAnchorElement
    }

    return originalCreateElement(tagName)
  })

  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: /normalize schema/i }))
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  await screen.findByRole('heading', { name: /insight candidates/i })

  fireEvent.click(screen.getByRole('button', { name: /export report/i }))

  expect(clickSpy).toHaveBeenCalled()
  expect(URL.createObjectURL).toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalled()

  createElementSpy.mockRestore()
  URL.createObjectURL = originalCreateObjectUrl
  URL.revokeObjectURL = originalRevokeObjectUrl
})
