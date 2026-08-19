import { render } from 'preact'
import { MantineProvider, createTheme } from '@mantine/core'
import '@mantine/core/styles.css'
import './index.css'
import { App } from './app.tsx'

const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: 'IBM Plex Sans, Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, IBM Plex Sans, sans-serif' }
})

render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <App />
  </MantineProvider>,
  document.getElementById('app')!
)
