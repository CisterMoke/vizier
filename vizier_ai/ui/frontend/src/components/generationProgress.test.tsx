import { render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { GenerationProgress, creepStep, creepTarget } from './GenerationProgress'

const renderProgress = (props: Parameters<typeof GenerationProgress>[0]) =>
  render(
    <MantineProvider>
      <GenerationProgress {...props} />
    </MantineProvider>
  )

const rerenderProgress = (
  rerender: (ui: React.ReactElement) => void,
  props: Parameters<typeof GenerationProgress>[0]
) =>
  rerender(
    <MantineProvider>
      <GenerationProgress {...props} />
    </MantineProvider>
  )

const fillWidth = () =>
  parseFloat(screen.getByTestId('progress-fill').style.width)

describe('GenerationProgress', () => {
  it('renders the step label and four checkpoint dots', () => {
    renderProgress({ phase: 'prepare', label: 'Preparing data…' })

    expect(screen.getByText('Preparing data…')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-schema')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-insights')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-charts')).toBeInTheDocument()
    expect(screen.getByTestId('checkpoint-done')).toBeInTheDocument()
  })

  it('spreads the four checkpoints evenly along the bar', () => {
    renderProgress({ phase: 'prepare', label: 'Preparing data…' })

    const positions = ['schema', 'insights', 'charts', 'done'].map((key) =>
      parseFloat(screen.getByTestId(`checkpoint-${key}`).style.left)
    )
    const band = 100 / positions.length
    positions.forEach((position, index) => {
      expect(position).toBeCloseTo(band * (index + 1))
    })
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
    expect(creepTarget('done')).toBe(100)
  })

  it('steps the charts band between the insights and charts checkpoints', () => {
    expect(creepTarget('charts')).toBe(70)
    expect(creepTarget('charts', 0, 2)).toBeCloseTo(62.5)
    expect(creepTarget('charts', 1, 2)).toBeCloseTo(75)
  })

  it('never creeps backwards: the fill is monotonic within a run', () => {
    // upload finished at 25%, the schema phase's ceiling is lower (20%)
    expect(creepStep(25, 20, 20_000, 100)).toBe(25)
    // a fresh bar still approaches its ceiling from below
    expect(creepStep(0, 20, 1200, 100)).toBeGreaterThan(0)
    expect(creepStep(0, 20, 1200, 100)).toBeLessThan(20)
  })

  it('resets the fill when a new run starts', async () => {
    const view = renderProgress({ phase: 'done', label: 'Done' })
    await waitFor(() => expect(fillWidth()).toBeGreaterThanOrEqual(99), { timeout: 3000 })

    rerenderProgress(view.rerender, { phase: 'prepare', label: 'Preparing data…' })

    await waitFor(() => expect(fillWidth()).toBeLessThanOrEqual(10), { timeout: 300 })
  })

  it('reports onFinished again for a second run', async () => {
    const onFinished = vi.fn()
    const view = renderProgress({ phase: 'done', label: 'Done', onFinished })
    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1), { timeout: 3000 })

    rerenderProgress(view.rerender, { phase: 'prepare', label: 'Preparing data…' })
    rerenderProgress(view.rerender, { phase: 'done', label: 'Done', onFinished })

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })
})
