import { render, screen } from '@testing-library/preact'
import { App } from './app'

it('renders schema normalization studio shell', () => {
  render(<App />)

  expect(screen.getByRole('heading', { name: /schema normalization studio/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /normalize schema/i })).toBeInTheDocument()
})
