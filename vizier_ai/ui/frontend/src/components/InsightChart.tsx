import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Skeleton, Stack } from '@mantine/core'
import type { InsightCandidate } from '../domain/types'
import type { InsightEdit } from '../domain/chartEdit'
import PlotlyComponent from 'react-plotly.js'
import Plotly from '../lib/plotly-bundle'
import { ensureTraceModules } from '../lib/plotly-bundle'
import { insightSvgUrl } from '../services/apiClient'

// react-plotly.js ships CJS; bundler interop can deliver the module wrapper
// ({ default: Component }) instead of the component itself.
const Plot =
  (PlotlyComponent as unknown as { default?: typeof PlotlyComponent }).default ?? PlotlyComponent

// Static object identities: PlotlyChart re-plots (Plotly.react) whenever
// data/layout/config prop identity changes, so these must never be inlined.
const PLOT_CONFIG = { responsive: true, displaylogo: false }
const PLOT_STYLE = { width: '100%', height: '100%' }

interface InsightChartProps {
  insight: InsightCandidate
  edit: InsightEdit | null
  sessionId: string
  onGraphDivChange?: (graphDiv: HTMLElement | null) => void
}

export function InsightChart({ insight, edit, sessionId, onGraphDivChange }: InsightChartProps) {
  // null = not yet observed: keep a skeleton so out-of-viewport thumbnails
  // (a server-side kaleido render) are never fetched speculatively on mount
  const [viewState, setViewState] = useState<boolean | null>(() =>
    typeof IntersectionObserver === 'undefined' ? true : null
  )
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const graphDivRef = useRef<HTMLElement | null>(null)
  const [modulesReady, setModulesReady] = useState(false)

  const plotlyData = edit?.plotlyData ?? insight.chart_spec.plotlyData ?? null
  const plotlyLayout = edit?.plotlyLayout ?? insight.chart_spec.plotlyLayout ?? null
  const showStatic =
    (edit?.staticSvg ?? null) !== null || (insight.chart_spec.isStatic === true && edit === null)
  const staticSrc = edit?.staticSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(edit.staticSvg)}`
    : insightSvgUrl(sessionId, insight.id)

  const plotLayout = useMemo(
    () => ({ ...(plotlyLayout as Partial<Plotly.Layout>), autosize: true }),
    [plotlyLayout]
  )

  const traceTypes = useMemo(
    () =>
      Array.from(
        new Set(
          ((plotlyData as Array<{ type?: string }> | null) ?? [])
            .map((trace) => trace?.type)
            .filter((type): type is string => Boolean(type))
        )
      ),
    [plotlyData]
  )

  useEffect(() => {
    let cancelled = false
    setModulesReady(false)
    ensureTraceModules(traceTypes).then(() => {
      if (!cancelled) setModulesReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [traceTypes])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const node = viewportRef.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      setViewState(entry?.isIntersecting ?? false)
    }, { rootMargin: '100px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // react-plotly.js's useResizeHandler and plotly's config.responsive both
  // only listen for WINDOW resizes — but grid cells resize through pure CSS
  // while dragging. Observe the cell's chart container and re-fit the plot
  // via Plotly.Plots.resize whenever its box changes.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const node = viewportRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      if (graphDivRef.current) Plotly.Plots.resize(graphDivRef.current)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    return () => onGraphDivChange?.(null)
  }, [onGraphDivChange])

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      <div ref={viewportRef} style={{ flex: 1, minHeight: 0 }}>
        {showStatic ? (
          <Stack gap="xs" h="100%">
            <img
              src={staticSrc}
              alt={`${insight.metadata.title} (static preview)`}
              data-testid="static-chart"
              style={{ width: '100%', height: 'auto' }}
            />
            <Badge variant="light" color="grape" w="fit-content">
              Static preview
            </Badge>
          </Stack>
        ) : viewState === false ? (
          <img
            src={insightSvgUrl(sessionId, insight.id)}
            alt={insight.metadata.title}
            data-testid="chart-thumbnail"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : modulesReady && viewState === true ? (
          <Plot
            data={plotlyData as Plotly.Data[]}
            layout={plotLayout}
            config={PLOT_CONFIG}
            style={PLOT_STYLE}
            useResizeHandler
            onInitialized={(_figure, graphDiv) => {
              graphDivRef.current = graphDiv
              onGraphDivChange?.(graphDiv)
            }}
          />
        ) : (
          <Skeleton height="100%" radius="md" />
        )}
      </div>
    </Stack>
  )
}
