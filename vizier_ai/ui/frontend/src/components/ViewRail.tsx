import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useClickOutside, useFocusWithin } from '@mantine/hooks'

export interface ViewItem {
  id: string
  label: string
  icon: ReactNode
  disabled?: boolean
}

interface ViewRailProps {
  views: ViewItem[]
  activeView: string
  onSelect?: (id: string) => void
}

export function ViewRail({ views, activeView, onSelect }: ViewRailProps) {
  const [expanded, setExpanded] = useState(false)
  const { ref: focusRef, focused } = useFocusWithin<HTMLDivElement>()
  const clickOutsideRef = useClickOutside<HTMLDivElement>(() => setExpanded(false))

  useEffect(() => {
    if (!focused) setExpanded(false)
  }, [focused])

  const railRef = (node: HTMLDivElement | null) => {
    focusRef(node)
    clickOutsideRef.current = node
  }

  return (
    <div className="h-full w-14 shrink-0">
      <div
        ref={railRef}
        role="navigation"
        aria-label="Views"
        data-expanded={String(expanded)}
        className={`h-full border-r border-gray-700/50 bg-gray-950/80 p-2 transition-all duration-200 ${
          expanded ? 'absolute inset-y-0 left-0 z-40 w-56 shadow-2xl' : 'w-14'
        }`}
      >
        <Text fw={700} size={expanded ? 'lg' : 'sm'} ta="center" px="xs" py="xs" truncate>
          {expanded ? 'Vizier' : 'V'}
        </Text>
        <Stack gap="xs" mt="md">
          {views.map((view) => {
            const button = (
              <UnstyledButton
                key={view.id}
                aria-current={view.id === activeView ? 'page' : undefined}
                aria-disabled={view.disabled ? 'true' : undefined}
                onClick={() => {
                  setExpanded(true)
                  if (!view.disabled) onSelect?.(view.id)
                }}
                /* padding must be inline: Mantine's unlayered base styles
                   override Tailwind v4's layered px-2/py-2 back to 0 */
                style={{ padding: '8px' }}
                className={`flex items-center gap-3 rounded-md text-sm transition-colors ${
                  view.id === activeView
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                } ${view.disabled ? 'cursor-default opacity-40' : ''}`}
              >
                {/* flex-centered: Tailwind preflight makes svg display:block,
                    which text-align cannot center */}
                <span className="flex w-6 justify-center">{view.icon}</span>
                <span className={expanded ? 'inline' : 'hidden'}>{view.label}</span>
              </UnstyledButton>
            )
            return view.disabled && !expanded ? (
              <Tooltip key={view.id} label={view.label} position="right">
                {button}
              </Tooltip>
            ) : button
          })}
        </Stack>
      </div>
    </div>
  )
}
