import { fireEvent, render, screen } from '@testing-library/preact'
import { App } from './app'

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
  expect(screen.getByRole('button', { name: /export report/i })).toBeInTheDocument()
})
