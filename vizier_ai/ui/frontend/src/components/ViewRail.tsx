import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { useFocusWithin } from '@mantine/hooks'

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
  const { ref, focused } = useFocusWithin<HTMLDivElement>()

  useEffect(() => {
    if (!focused) setExpanded(false)
  }, [focused])

  return (
    <div className="w-14 shrink-0">
      <div
        ref={ref}
        role="navigation"
        aria-label="Views"
        data-expanded={String(expanded)}
        className={`h-full border-r border-gray-700/50 bg-gray-950/80 p-2 transition-all duration-200 ${
          expanded ? 'absolute inset-y-0 left-0 z-40 w-56 shadow-2xl' : 'w-14'
        }`}
      >
        <Text fw={700} size={expanded ? 'lg' : 'sm'} px="xs" py="xs" truncate>
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
                className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                  view.id === activeView
                    ? 'bg-cyan-500/15 text-cyan-300'
                    : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200'
                } ${view.disabled ? 'cursor-default opacity-40' : ''}`}
              >
                <span className="w-6 text-center">{view.icon}</span>
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
