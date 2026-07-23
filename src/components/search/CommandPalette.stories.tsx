import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { CommandPalette } from '@/components/search/CommandPalette'

/**
 * Cmd/Ctrl+K command palette (wow moment #2): BM25-ranked article search plus
 * navigation and theme actions.
 *
 * @remarks The article group loads from `/api/search`, which does not exist
 * inside Storybook — the palette renders its graceful "Search is unavailable"
 * empty state instead. Navigation, actions, and keyboard behavior are fully
 * exercisable.
 */
const meta = {
  title: 'Search/CommandPalette',
  component: CommandPalette,
  tags: ['autodocs'],
} satisfies Meta<typeof CommandPalette>

export default meta
type Story = StoryObj<typeof meta>

export const TriggerButton: Story = {}
