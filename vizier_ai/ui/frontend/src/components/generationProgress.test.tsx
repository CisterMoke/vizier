import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { GenerationProgress, creepTarget } from './GenerationProgress'

const renderProgress = (props: Parameters<typeof GenerationProgress>[0]) =>
  render(
    <MantineProvider>
      <GenerationProgress {...props} />
    </MantineProvider>
  )

describe('GenerationProgress', () => {
  it('renders the step label and four checkpoint dots', () => {
    renderProgress({ phase: 'prepare', label: 'Preparing data…' })

    expect(screen.getByText('Preparing data…')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-schema')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-insights')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-charts')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-done')).toBeInTheDocument()
  })

  it('fills checkpoints as their phase completes', () => {
    renderProgress({ phase: 'charts', label: 'Building chart 1 of 3', chartIndex: 0, chartTotal: 3 })

    const filled = (key: string) =>
      screen.getByTestId(`checkpoint-${key}`).className.includes('bg-cyan-300')

    expect(filled('schema')).toBe(true)
    expect(filled('insights')).toBe(true)
    expect(filled('charts')).toBe(false)
    expect(filled('done')).toBe(false)
  })

  it('fills the charts checkpoint once the last chart event arrives', () => {
    renderProgress({ phase: 'charts', label: 'Building chart 3 of 3', chartIndex: 2, chartTotal: 3 })

    const filled = (key: string) =>
      screen.getByTestId(`checkpoint-${key}`).className.includes('bg-cyan-300')

    expect(filled('schema')).toBe(true)
    expect(filled('insights')).toBe(true)
    expect(filled('charts')).toBe(true)
    expect(filled('done')).toBe(false)
  })

  it('marks every checkpoint filled when done', () => {
    renderProgress({ phase: 'done', label: 'Done' })

    for (const key of ['schema', 'insights', 'charts', 'done']) {
      expect(screen.getByTestId(`checkpoint-${key}`).className).toContain('bg-cyan-300')
    }
  })

  it('finishes and reports onFinished when the done phase completes', async () => {
    const onFinished = vi.fn()
    renderProgress({ phase: 'done', label: 'Done', onFinished })

    await waitFor(() => expect(onFinished).toHaveBeenCalled(), { timeout: 3000 })
  })

  it('tracks upload progress exactly within the schema band', () => {
    expect(creepTarget('upload', undefined, undefined, 0)).toBe(0)
    expect(creepTarget('upload', undefined, undefined, 0.5)).toBe(12.5)
    expect(creepTarget('upload', undefined, undefined, 1)).toBe(25)
  })

  it('pulses the schema checkpoint while uploading', () => {
    renderProgress({ phase: 'upload', label: 'Uploading data… 50%', uploadFraction: 0.5 })
    expect(screen.getByTestId('checkpoint-schema').className).toContain('animate-pulse')
  })

  it('caps the asymptotic creep at 80% of the gap to the next checkpoint', () => {
    expect(creepTarget('prepare')).toBe(20)
    expect(creepTarget('schema')).toBe(20)
    expect(creepTarget('insights')).toBe(45)
    expect(creepTarget('charts')).toBe(70)
    expect(creepTarget('charts', 0, 2)).toBeCloseTo(62.5)
    expect(creepTarget('done')).toBe(100)
  })
})
