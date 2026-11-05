import { useEffect, useRef, useState } from 'react'
import { Container, Group, Text } from '@mantine/core'

export type GenerationPhase = 'upload' | 'prepare' | 'schema' | 'insights' | 'charts' | 'done'

interface GenerationProgressProps {
  phase: GenerationPhase
  label: string
  chartIndex?: number
  chartTotal?: number
  uploadFraction?: number
  onFinished?: () => void
}

interface Checkpoint {
  key: string
  position: number
  title: string
}

/** Pipeline milestones in order, one per stage the user waits through
 * (data+schema, insights, charts, completion). The checkpoint dots are
 * spread evenly along the bar — one equal band per milestone — derived
 * from this single list. */
const MILESTONES = ['schema', 'insights', 'charts', 'done'] as const
type Milestone = (typeof MILESTONES)[number]

const MILESTONE_TITLES: Record<Milestone, string> = {
  schema: 'Schema',
  insights: 'Insights',
  charts: 'Charts',
  done: 'Done',
}

/** Even spacing: milestone k sits at the end of its band. */
const milestonePosition = (milestone: Milestone): number =>
  (100 * (MILESTONES.indexOf(milestone) + 1)) / MILESTONES.length

/** A milestone's band starts where the previous milestone's band ended. */
const bandStart = (milestone: Milestone): number => {
  const index = MILESTONES.indexOf(milestone)
  return index <= 0 ? 0 : milestonePosition(MILESTONES[index - 1])
}

const CHECKPOINTS: Checkpoint[] = MILESTONES.map((key) => ({
  key,
  position: milestonePosition(key),
  title: MILESTONE_TITLES[key],
}))

/** Where the fill creeps toward while each checkpoint is pending. The
 * approach is asymptotic — the bar never quite reaches its target, so a
 * completed checkpoint is always visibly "earned". */
const CREEP_TAU_MS = 1200

/** The two LLM calls (schema extraction, insight generation) are the long,
 * uncertain waits: with this time constant the fill covers ~95% of the gap
 * after a minute — almost reaching the checkpoint it is waiting on. Data
 * preparation and chart building are quick, local steps and keep the
 * snappy creep. */
const SLOW_CREEP_TAU_MS = 20_000

const creepTauMs = (phase: GenerationPhase): number =>
  phase === 'schema' || phase === 'insights' ? SLOW_CREEP_TAU_MS : CREEP_TAU_MS

/** Upload progress is real, not uncertain: track it tightly instead of
 * creeping, so the bar stays honest while bytes leave. */
const UPLOAD_TRACK_TAU_MS = 250

/** Ceiling the fill creeps toward while a phase is pending: 80% of the
 * way from the last earned position to the next checkpoint. The bar
 * visibly stalls short of the checkpoint, so earning it stays obvious —
 * and a slow phase never looks "almost done". */
export const CREEP_GAP_FRACTION = 0.8

export const creepTarget = (
  phase: GenerationPhase,
  chartIndex?: number,
  chartTotal?: number,
  uploadFraction?: number
): number => {
  const reached = reachedPosition(phase, chartIndex, chartTotal)
  const target = targetPosition(phase, chartIndex, chartTotal, uploadFraction)
  const gapFraction = phase === 'upload' ? 1 : CREEP_GAP_FRACTION
  return reached + (target - reached) * gapFraction
}

/** One exponential creep step toward the target — monotonic: the fill
 * never moves backwards within a run (e.g. a completed upload sits at
 * 25% while the schema phase's ceiling is lower; the bar must hold). */
export const creepStep = (current: number, target: number, tauMs: number, dt: number): number =>
  Math.max(current, target - (target - current) * Math.exp(-dt / tauMs))

/** Finishing is certain: ease out to 100% quickly instead of creeping. */
const FINISH_DURATION_MS = 450
const FADE_DURATION_MS = 250

/** Progress earned so far: each phase transition means the previous
 * checkpoint's work completed. */
const reachedPosition = (phase: GenerationPhase, chartIndex?: number, chartTotal?: number): number => {
  switch (phase) {
    case 'upload':
      return 0
    case 'prepare':
      return 0
    case 'schema':
      return 0
    case 'insights':
      return bandStart('insights')
    case 'charts':
      if (chartTotal && chartTotal > 0) {
        const start = bandStart('charts')
        const width = milestonePosition('charts') - start
        return start + (width * ((chartIndex ?? 0) + 1)) / chartTotal
      }
      return bandStart('charts')
    case 'done':
      return 100
  }
}

const targetPosition = (
  phase: GenerationPhase,
  chartIndex?: number,
  chartTotal?: number,
  uploadFraction?: number
): number => {
  switch (phase) {
    case 'upload':
      return milestonePosition('schema') * (uploadFraction ?? 0)
    case 'prepare':
      return milestonePosition('schema')
    case 'schema':
      return milestonePosition('schema')
    case 'insights':
      return milestonePosition('insights')
    case 'charts':
      if (chartTotal && chartTotal > 0) {
        const start = bandStart('charts')
        const width = milestonePosition('charts') - start
        return start + (width * ((chartIndex ?? 0) + 1)) / chartTotal
      }
      return milestonePosition('charts')
    case 'done':
      return 100
  }
}

const checkpointFilled = (checkpoint: Checkpoint, phase: GenerationPhase, chartIndex?: number, chartTotal?: number): boolean => {
  const reached = reachedPosition(phase, chartIndex, chartTotal)
  return checkpoint.position <= reached + 0.01
}

const checkpointActive = (checkpoint: Checkpoint, phase: GenerationPhase): boolean => {
  switch (checkpoint.key) {
    case 'schema':
      return phase === 'upload' || phase === 'prepare' || phase === 'schema'
    case 'insights':
      return phase === 'insights'
    case 'charts':
      return phase === 'charts'
    case 'done':
      return false
  }
  return false
}

/** Slim progress strip hovering at the top of the viewport. The fill
 * creeps asymptotically toward the next checkpoint while the pipeline is
 * waiting on it, eases smoothly between updates, and finishes with a
 * short fade once the final checkpoint is reached. */
export function GenerationProgress({
  phase,
  label,
  chartIndex,
  chartTotal,
  uploadFraction,
  onFinished,
}: GenerationProgressProps) {
  const fillRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLDivElement>(null)
  const displayRef = useRef(0)
  const targetRef = useRef(creepTarget(phase, chartIndex, chartTotal, uploadFraction))
  const finishedRef = useRef(false)
  const [closing, setClosing] = useState(false)

  targetRef.current = creepTarget(phase, chartIndex, chartTotal, uploadFraction)

  useEffect(() => {
    if (phase !== 'done') {
      setClosing(false)
    }
  }, [phase])

  // A new run can start while this instance is still mounted (the
  // previous run's done-fade window): reset the fill and the finished
  // latch so the bar starts from 0 and the next done phase still fires
  // onFinished.
  useEffect(() => {
    if (phase !== 'upload' && phase !== 'prepare') return
    displayRef.current = 0
    finishedRef.current = false
    if (fillRef.current) fillRef.current.style.width = '0%'
    if (pctRef.current) pctRef.current.textContent = '0%'
  }, [phase])

  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let phaseStart = performance.now()
    let startValue = displayRef.current

    const paint = (value: number) => {
      displayRef.current = value
      if (fillRef.current) fillRef.current.style.width = `${value}%`
      if (pctRef.current) pctRef.current.textContent = `${Math.round(value)}%`
    }

    const tick = () => {
      // one clock for everything — rAF's callback timestamp can come from
      // a different time origin (jsdom, embedded webviews); dt is clamped
      // so throttled tabs and long pauses never teleport the bar
      const now = performance.now()
      const dt = Math.min(Math.max(now - last, 0), 100)
      last = now
      const target = targetRef.current

      if (phase === 'done') {
        // certainty: ease out to 100%, then fade and finish
        const t = Math.min(1, (now - phaseStart) / FINISH_DURATION_MS)
        const eased = 1 - (1 - t) ** 3
        paint(startValue + (100 - startValue) * eased)
        if (t >= 1 && !finishedRef.current) {
          finishedRef.current = true
          setClosing(true)
          window.setTimeout(() => onFinished?.(), FADE_DURATION_MS)
          return
        }
      } else {
        // uncertainty: exponential approach — asymptotic creep toward
        // 80% of the gap to the next checkpoint, stalling visibly short
        const current = displayRef.current
        const next = creepStep(
          current,
          target,
          phase === 'upload' ? UPLOAD_TRACK_TAU_MS : creepTauMs(phase),
          dt
        )
        paint(next)
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, onFinished])

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[200] border-b border-gray-700/50 bg-[#0a0a0f]/90 backdrop-blur-md transition-opacity duration-200 ${closing ? 'opacity-0' : 'opacity-100'}`}
      data-testid="generation-progress"
      role="status"
      aria-label={label}
    >
      <Container size="xl" px="md">
        <Group gap="md" h={42} wrap="nowrap">
          <Text size="sm" className="min-w-0 flex-[0_1_38%] truncate">{label}</Text>
          <div className="relative h-1.5 flex-1 rounded-full bg-gray-700/40">
            <div
              ref={fillRef}
              data-testid="progress-fill"
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
              style={{ width: '0%' }}
            />
            {CHECKPOINTS.map((checkpoint) => {
              const filled = checkpointFilled(checkpoint, phase, chartIndex, chartTotal)
              const active = !filled && checkpointActive(checkpoint, phase)
              return (
                <div
                  key={checkpoint.key}
                  data-testid={`checkpoint-${checkpoint.key}`}
                  title={checkpoint.title}
                  className={`absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-300 ${
                    filled
                      ? 'border-cyan-300 bg-cyan-300 shadow-[0_0_6px_rgba(34,211,238,0.8)]'
                      : active
                        ? 'animate-pulse border-cyan-400/70 bg-[#0a0a0f]'
                        : 'border-gray-600 bg-[#0a0a0f]'
                  }`}
                  style={{ left: `${checkpoint.position}%` }}
                />
              )
            })}
          </div>
          <div ref={pctRef} className="w-10 text-right" />
        </Group>
      </Container>
    </div>
  )
}
