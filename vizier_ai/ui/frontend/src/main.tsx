import { createRoot } from 'react-dom/client'
import { MantineProvider, createTheme } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import './index.css'
import { App } from './app.tsx'

const theme = createTheme({
  primaryColor: 'cyan',
  fontFamily: 'IBM Plex Sans, Space Grotesk, sans-serif',
  headings: { fontFamily: 'Space Grotesk, IBM Plex Sans, sans-serif' }
})

createRoot(document.getElementById('app')!).render(
  <MantineProvider theme={theme} defaultColorScheme="dark">
    <Notifications />
    <App />
  </MantineProvider>
)
