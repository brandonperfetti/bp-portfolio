import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ShareButton } from '@/components/cms/ShareButton'
import { SHARE_TARGET_IDS } from '@/lib/share/vocabulary'

const URL = 'https://brandonperfetti.com/articles/deep-modules'
const TITLE = 'Deep Modules'

/**
 * The "Share" pill (#53/T3). Matches `CopyPageButton`'s outlined-pill styling
 * so the two read as one actions row. In Storybook (fine-pointer, desktop)
 * clicking always opens the `ShareModal`; the native-share sheet only appears
 * on coarse-pointer devices with the Web Share API — that gate is covered by
 * the unit test.
 */
const meta = {
  title: 'CMS/ShareButton',
  component: ShareButton,
  tags: ['autodocs'],
} satisfies Meta<typeof ShareButton>

export default meta
type Story = StoryObj<typeof meta>

/** Idle pill: icon + "Share" label, no dialog yet. */
export const Idle: Story = {
  args: {
    url: URL,
    title: TITLE,
    targetIds: SHARE_TARGET_IDS,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const button = canvas.getByRole('button', { name: /share/i })
    await expect(button).toBeVisible()
    // Idle: no dialog is mounted until the pill is clicked.
    await expect(within(document.body).queryByRole('dialog')).toBeNull()
  },
}

/**
 * Clicking the pill on a desktop (fine-pointer) surface opens the modal —
 * the default path in Storybook.
 */
export const OpensModal: Story = {
  args: {
    url: URL,
    title: TITLE,
    targetIds: SHARE_TARGET_IDS,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: /share/i }))
    await waitFor(() =>
      expect(within(document.body).getByRole('dialog')).toBeVisible(),
    )
  },
}
