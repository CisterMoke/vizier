import { render, screen } from '@testing-library/preact'
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
