import Plotly from 'plotly.js/lib/core'
import bar from 'plotly.js/lib/bar'
import pie from 'plotly.js/lib/pie'
import heatmap from 'plotly.js/lib/heatmap'

Plotly.register([bar, pie, heatmap])

const loadedModules = new Set<string>()

async function loadTraceModule(
  key: string,
  loader: () => Promise<{ default: unknown }>
): Promise<void> {
  if (loadedModules.has(key)) return
  const mod = await loader()
  Plotly.register([mod.default] as never[])
  loadedModules.add(key)
}

/**
 * Registers the trace modules required by the given plotly trace types.
 * Heavier modules (geo maps, WebGL scatter) are loaded on demand so the
 * base chart chunk stays small.
 */
export async function ensureTraceModules(traceTypes: readonly string[]): Promise<void> {
  const needed = new Set(traceTypes)
  const loads: Promise<void>[] = []

  if (needed.has('scattergeo')) {
    loads.push(loadTraceModule('scattergeo', () => import('plotly.js/lib/scattergeo')))
  }
  if (needed.has('scattergl')) {
    loads.push(loadTraceModule('scattergl', () => import('plotly.js/lib/scattergl')))
  }

  await Promise.all(loads)
}

export default Plotly
