import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ShareModal, type ShareModalProps } from '@/components/cms/ShareModal'
import { resolveShareTargets } from '@/lib/share/shareTargets'

const ALL_TARGET_IDS = [
  'x',
  'linkedin',
  'facebook',
  'reddit',
  'hackernews',
  'email',
  'copylink',
]

const URL = 'https://brandonperfetti.com/articles/deep-modules'
const TITLE = 'Deep Modules'

/**
 * Controlled harness: the modal is presentational (`open`/`onClose` are props),
 * so the story owns the state — this makes Escape/backdrop/close-button
 * dismissal observable in the interaction test.
 */
function ControlledModal(props: Omit<ShareModalProps, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(true)
  return <ShareModal {...props} open={open} onClose={() => setOpen(false)} />
}

/**
 * The desktop share dialog (#53/T3). An icon row of intent links plus a
 * copy-link field (the floor). `copylink` never appears as an icon — it is
 * the copy-link field. Built on Headless UI `Dialog` for focus-trap,
 * Escape-to-close, and focus restore; the fade honors reduced motion.
 */
const meta = {
  title: 'CMS/ShareModal',
  component: ShareModal,
  tags: ['autodocs'],
  render: (args) => (
    <ControlledModal url={args.url} title={args.title} targets={args.targets} />
  ),
} satisfies Meta<typeof ShareModal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * All 7 resolved targets: 6 intent icons (X, LinkedIn, Facebook, Reddit,
 * Hacker News, Email) plus the copy-link field for `copylink`.
 */
export const AllTargets: Story = {
  args: {
    open: true,
    onClose: () => {},
    url: URL,
    title: TITLE,
    targets: resolveShareTargets(ALL_TARGET_IDS, [], []),
  },
  play: async () => {
    const body = within(document.body)

    const dialog = await waitFor(() => body.getByRole('dialog'))
    await expect(dialog).toBeVisible()
    await expect(body.getByText('Share')).toBeVisible()

    // Exactly one link per non-copylink target (6), with intent href + label.
    const x = body.getByRole('link', { name: 'Share on X' })
    await expect(x).toHaveAttribute(
      'href',
      `https://x.com/intent/tweet?text=${encodeURIComponent(
        TITLE,
      )}&url=${encodeURIComponent(URL)}`,
    )
    await expect(x).toHaveAttribute('target', '_blank')
    await expect(x).toHaveAttribute('rel', 'noopener noreferrer')

    // copylink is NOT an icon link — it is the copy-link field only.
    await expect(body.queryByRole('link', { name: /copy link/i })).toBeNull()
    await expect(body.getAllByRole('link')).toHaveLength(6)

    // The read-only field shows the URL and offers a Copy button. (The
    // clipboard write + "Copied" transition is asserted in the unit test,
    // where the Clipboard API is mocked — headless browsers block real
    // clipboard access.)
    const field = body.getByLabelText('Page link') as HTMLInputElement
    await expect(field).toHaveValue(URL)
    await expect(field).toHaveAttribute('readonly')
    await expect(body.getByRole('button', { name: 'Copy' })).toBeVisible()
  },
}

/**
 * Floor-only: `copylink` alone. No icon row — only the copy-link field, the
 * always-present affordance.
 */
export const FloorOnly: Story = {
  args: {
    open: true,
    onClose: () => {},
    url: URL,
    title: TITLE,
    targets: resolveShareTargets(['copylink'], [], []),
  },
  play: async () => {
    const body = within(document.body)

    await waitFor(() => expect(body.getByRole('dialog')).toBeVisible())

    // Floor-only: no intent icon links at all.
    await expect(body.queryByRole('link')).toBeNull()
    // The copy-link field is still present.
    await expect(body.getByLabelText('Page link')).toHaveValue(URL)
    await expect(body.getByRole('button', { name: 'Copy' })).toBeVisible()

    // Escape closes the dialog (Headless UI Dialog wiring).
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
  },
}
