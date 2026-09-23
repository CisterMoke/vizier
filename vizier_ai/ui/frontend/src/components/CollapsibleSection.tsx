import { useState } from 'react'
import type { ReactNode } from 'react'
import { Group, Stack, Text, UnstyledButton } from '@mantine/core'

interface CollapsibleSectionProps {
  label: string
  description?: string
  defaultOpened?: boolean
  children: ReactNode
}

export function CollapsibleSection({ label, description, defaultOpened = false, children }: CollapsibleSectionProps) {
  const [opened, setOpened] = useState(defaultOpened)

  return (
    <Stack gap="xs">
      <UnstyledButton
        onClick={() => setOpened((current) => !current)}
        aria-expanded={opened}
      >
        <Group gap="xs" wrap="nowrap">
          <Text
            component="span"
            c="dimmed"
            size="sm"
            style={{ transform: opened ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease', display: 'inline-block' }}
          >
            ▸
          </Text>
          <Text fw={500} size="sm" component="span">{label}</Text>
        </Group>
      </UnstyledButton>
      {description ? <Text c="dimmed" size="xs">{description}</Text> : null}
      {opened ? <Stack gap="sm">{children}</Stack> : null}
    </Stack>
  )
}
