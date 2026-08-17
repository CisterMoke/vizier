import { render, screen } from '@testing-library/preact'
import { App } from './app'

it('renders app scaffold heading', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /get started/i })).toBeInTheDocument()
})
