import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { InsightCandidate } from '../domain/types'
import type { BundleContext } from '../domain/bundle'
import type { CsvOptionsPayload } from '../domain/csv'
import type { ExcelOptionsPayload } from '../domain/excel'
import type { InsightEdit } from '../domain/chartEdit'
import { appendLayout, defaultLayout, type LayoutItem } from '../domain/layout'

export interface GenerationSnapshot {
  sessionId: string
  insights: InsightCandidate[]
  context: BundleContext | null
  csvOptions?: CsvOptionsPayload | null
  excelOptions?: ExcelOptionsPayload | null
}

export interface RemovedInsight {
  insight: InsightCandidate
  layoutItem: LayoutItem | null
  edit: InsightEdit | null
}

interface WorkspaceValue {
  insights: InsightCandidate[]
  sessionId: string
  bundleContext: BundleContext | null
  csvOptions: CsvOptionsPayload | null
  excelOptions: ExcelOptionsPayload | null
  layout: LayoutItem[]
  insightEdits: Record<string, InsightEdit>
  locked: boolean
  applyGeneration: (snapshot: GenerationSnapshot) => void
  appendInsights: (insights: InsightCandidate[], context: BundleContext | null) => void
  removeInsight: (insightId: string) => RemovedInsight | null
  restoreInsight: (removed: RemovedInsight) => void
  setInsightEdit: (insightId: string, edit: InsightEdit | null) => void
  setLayout: (items: LayoutItem[]) => void
  resetWorkspace: () => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [insights, setInsights] = useState<InsightCandidate[]>([])
  const [sessionId, setSessionId] = useState('')
  const [bundleContext, setBundleContext] = useState<BundleContext | null>(null)
  const [csvOptions, setCsvOptions] = useState<CsvOptionsPayload | null>(null)
  const [excelOptions, setExcelOptions] = useState<ExcelOptionsPayload | null>(null)
  const [layout, setLayout] = useState<LayoutItem[]>([])
  const [insightEdits, setInsightEdits] = useState<Record<string, InsightEdit>>({})

  const applyGeneration = useCallback((snapshot: GenerationSnapshot) => {
    setInsights(snapshot.insights)
    setSessionId(snapshot.sessionId)
    setBundleContext(snapshot.context)
    setCsvOptions(snapshot.csvOptions ?? null)
    setExcelOptions(snapshot.excelOptions ?? null)
    setLayout(defaultLayout(snapshot.insights.map((insight) => insight.id)))
    setInsightEdits({})
  }, [])

  const appendInsights = useCallback((newInsights: InsightCandidate[], context: BundleContext | null) => {
    setInsights((current) => [...current, ...newInsights])
    setBundleContext(context)
    setLayout((current) => appendLayout(current, newInsights.map((insight) => insight.id)))
  }, [])

  const removeInsight = useCallback(
    (insightId: string): RemovedInsight | null => {
      const insight = insights.find((item) => item.id === insightId)
      if (!insight) return null
      const layoutItem = layout.find((item) => item.i === insightId) ?? null
      const edit = insightEdits[insightId] ?? null
      setInsights((current) => current.filter((item) => item.id !== insightId))
      setLayout((current) => current.filter((item) => item.i !== insightId))
      setInsightEdits((current) => {
        const next = { ...current }
        delete next[insightId]
        return next
      })
      return { insight, layoutItem, edit }
    },
    [insights, layout, insightEdits]
  )

  const restoreInsight = useCallback((removed: RemovedInsight) => {
    setInsights((current) =>
      current.some((item) => item.id === removed.insight.id) ? current : [...current, removed.insight]
    )
    setLayout((current) => {
      if (removed.layoutItem && !current.some((item) => item.i === removed.insight.id)) {
        return [...current, removed.layoutItem]
      }
      return current
    })
    if (removed.edit) {
      setInsightEdits((current) => ({ ...current, [removed.insight.id]: removed.edit as InsightEdit }))
    }
  }, [])

  const setInsightEdit = useCallback((insightId: string, edit: InsightEdit | null) => {
    setInsightEdits((current) => {
      const next = { ...current }
      if (edit === null) delete next[insightId]
      else next[insightId] = edit
      return next
    })
  }, [])

  const resetWorkspace = useCallback(() => {
    setInsights([])
    setSessionId('')
    setBundleContext(null)
    setCsvOptions(null)
    setExcelOptions(null)
    setLayout([])
    setInsightEdits({})
  }, [])

  const value = useMemo<WorkspaceValue>(
    () => ({
      insights,
      sessionId,
      bundleContext,
      csvOptions,
      excelOptions,
      layout,
      insightEdits,
      locked: insights.length > 0,
      applyGeneration,
      appendInsights,
      removeInsight,
      restoreInsight,
      setInsightEdit,
      setLayout,
      resetWorkspace,
    }),
    [
      insights, sessionId, bundleContext, csvOptions, excelOptions, layout, insightEdits,
      applyGeneration, appendInsights, removeInsight, restoreInsight, setInsightEdit, resetWorkspace,
    ]
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return value
}
