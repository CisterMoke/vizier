import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { ControlPanel } from './ControlPanel'
import { WorkspaceProvider, useWorkspace } from '../store/workspace'
import { EMPTY_CONSTRAINTS } from '../domain/constraints'
import type { GenerateRequest, InsightCandidate } from '../domain/types'

vi.mock('../services/apiClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/apiClient')>()
  return { ...actual, fetchConfig: vi.fn().mockResolvedValue({ maxFileSize: null, maxRows: null }) }
})

const insight: InsightCandidate = {
  id: 'i1',
  metadata: { title: 'T', summary: 'S', description: null },
  chart_spec: { traces: [], plotlyData: [], plotlyLayout: {} },
}

const renderPanel = (props: Partial<Parameters<typeof ControlPanel>[0]> = {}, locked = false) => {
  const Harness = () => {
    const ws = useWorkspace()
    return (
      <>
        <button
          data-testid="lock"
          onClick={() => ws.applyGeneration({ sessionId: 's1', insights: [insight], context: null })}
        >
          lock
        </button>
        <ControlPanel
          isGenerating={false}
          isRegenerating={false}
          hasRealData={false}
          constraints={EMPTY_CONSTRAINTS}
          onConstraintsChange={vi.fn()}
          onGenerate={vi.fn().mockResolvedValue(undefined)}
          onRegenerate={vi.fn()}
          {...props}
        />
      </>
    )
  }
  const utils = render(
    <MantineProvider>
      <WorkspaceProvider>
        <Harness />
      </WorkspaceProvider>
    </MantineProvider>
  )
  if (locked) fireEvent.click(screen.getByTestId('lock'))
  return utils
}

it('submits the data description through onGenerate', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderPanel({ onGenerate })
  fireEvent.input(screen.getByLabelText(/data description/i), { target: { value: 'orders(id int)' } })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  const request = onGenerate.mock.calls[0][0] as GenerateRequest
  expect(request.schemaText).toBe('orders(id int)')
  expect(request.dataSource.mode).toBe('none')
})

it('does not submit when the description is empty', () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderPanel({ onGenerate })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  expect(onGenerate).not.toHaveBeenCalled()
})

it('renders the data source selector with all options', () => {
  renderPanel()
  expect(screen.getByText(/none \(use mock data\)/i)).toBeInTheDocument()
  expect(screen.getByText(/file upload/i)).toBeInTheDocument()
  expect(screen.getByText(/rest api/i)).toBeInTheDocument()
  expect(screen.getByText(/sql query/i)).toBeInTheDocument()
})

it('shows csv options in file mode and sends them with the request', async () => {
  const onGenerate = vi.fn().mockResolvedValue(undefined)
  renderPanel({ onGenerate })
  fireEvent.click(screen.getByLabelText(/real data source/i, { selector: 'input' }))
  fireEvent.click(await screen.findByRole('option', { name: /file upload/i }))
  fireEvent.click(await screen.findByRole('button', { name: /csv options/i }))
  fireEvent.input(screen.getByLabelText(/quote character/i), { target: { value: "'" } })
  fireEvent.input(screen.getByLabelText(/data description/i), { target: { value: 'd' } })
  fireEvent.click(screen.getByRole('button', { name: /generate insights/i }))
  await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
  const request = onGenerate.mock.calls[0][0] as GenerateRequest
  expect(request.csvOptions).toEqual({ quote_char: "'" })
})

it('locks inputs and generate while insights exist, showing the hint', () => {
  renderPanel({}, true)
  expect(screen.getByLabelText(/data description/i)).toBeDisabled()
  expect(screen.getByLabelText(/real data source/i, { selector: 'input' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^generate insights/i })).toBeDisabled()
  expect(
    screen.getByText(/insights exist — reset the workspace to load new data/i)
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /regenerate insights/i })).toBeEnabled()
  expect(screen.getByRole('button', { name: /reset workspace/i })).toBeEnabled()
})

it('keeps constraints editable while locked', () => {
  const onConstraintsChange = vi.fn()
  renderPanel({ onConstraintsChange }, true)
  fireEvent.click(screen.getByRole('button', { name: /advanced options/i }))
  fireEvent.input(screen.getByLabelText(/guidance/i), { target: { value: 'focus' } })
  expect(onConstraintsChange).toHaveBeenCalledTimes(1)
})

it('reset asks for confirmation, then unlocks the panel', async () => {
  renderPanel({}, true)
  fireEvent.click(screen.getByRole('button', { name: /reset workspace/i }))
  await screen.findByText(/all insights, edits, and the mosaic layout will be cleared/i)
  fireEvent.click(screen.getByRole('button', { name: /^reset$/i }))
  expect(screen.getByLabelText(/data description/i)).toBeEnabled()
  expect(screen.getByRole('button', { name: /^generate insights/i })).toBeEnabled()
  expect(screen.queryByRole('button', { name: /regenerate insights/i })).not.toBeInTheDocument()
})

it('cancel keeps the workspace locked', async () => {
  renderPanel({}, true)
  fireEvent.click(screen.getByRole('button', { name: /reset workspace/i }))
  fireEvent.click(await screen.findByRole('button', { name: /^cancel$/i }))
  expect(screen.getByRole('button', { name: /^generate insights/i })).toBeDisabled()
})

it('shows the real data badge when real data is attached', () => {
  renderPanel({ hasRealData: true })
  expect(screen.getByText(/^real data$/i)).toBeInTheDocument()
})
