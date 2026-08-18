import { render } from 'preact'
import { MantineProvider } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import { App } from './app.tsx'

render(
  <MantineProvider>
    <App />
  </MantineProvider>,
  document.getElementById('app')!
)
