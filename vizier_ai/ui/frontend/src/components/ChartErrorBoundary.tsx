import { Component, type ReactNode } from 'react'
import { Alert, Button, Stack, Text } from '@mantine/core'

interface ChartErrorBoundaryProps {
  children: ReactNode
}

interface ChartErrorBoundaryState {
  error: Error | null
}

/**
 * Keeps chart-rendering failures (third-party plotly code) from unmounting
 * the entire application tree.
 */
export class ChartErrorBoundary extends Component<ChartErrorBoundaryProps, ChartErrorBoundaryState> {
  state: ChartErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ChartErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Chart rendering failed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <Alert color="red" title="Chart rendering failed">
          <Stack gap="sm">
            <Text size="sm">{this.state.error.message}</Text>
            <Button size="xs" variant="light" w="fit-content" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          </Stack>
        </Alert>
      )
    }

    return this.props.children
  }
}
