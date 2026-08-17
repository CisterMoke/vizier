import { render, screen } from '@testing-library/preact'
import { App } from './app'

it('renders schema input heading', () => {
  render(<App />)
  expect(screen.getByText(/schema/i)).toBeInTheDocument()
})
