import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'

import { Button } from '@/components/ui/button'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

/**
 * shadcn/ui Dialog primitive (Radix). The overlay mechanism for the whole
 * site — `docs/ACCESSIBILITY.md` §Focus: it owns the focus trap, the focus
 * restore, Escape, outside-click dismissal, the portal and `role="dialog"`,
 * and nothing hand-rolled may replace any of them.
 *
 * @remarks Two things a caller still owes, and both are visible here.
 * `aria-modal` is not emitted by Radix (it hides the rest of the page with
 * `aria-hidden` on the portal's siblings instead), so a contract that pins it
 * passes it through `DialogContent`. And the trigger must be a
 * `DialogTrigger`: `DialogContentModal` handles close-auto-focus by cancelling
 * `FocusScope`'s own restore and focusing `context.triggerRef.current`
 * instead, which only `DialogTrigger` populates — so a dialog opened from a
 * plain sibling button restores focus to nothing and drops it on `<body>`.
 *
 * The panel is portalled to `document.body`, so every assertion below queries
 * the document rather than the story canvas. That is also what proves the
 * portal.
 *
 * What is NOT asserted here: that the page behind the modal leaves the
 * accessibility tree. Radix's `hideOthers` sweep marks the portal's body-level
 * siblings `aria-hidden`, and in this runner the story canvas is not among the
 * nodes it reaches — a harness detail, not a product one. That requirement is
 * pinned on a real surface instead, by `ExternalLinkConfirmation` in
 * `CorvusChat.stories.tsx` and by `CorvusChat.linkSafety.test.tsx`.
 */
const meta = {
  title: 'UI/Dialog',
  component: Dialog,
  tags: ['autodocs'],
} satisfies Meta<typeof Dialog>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default path, with the ✕ `showCloseButton` renders. Nothing else in the
 * repo exercises it — `CorvusChat` opts out — so this story is where the
 * a11y addon sees it.
 */
export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this draft?</DialogTitle>
          <DialogDescription>
            The draft and its revision history are removed. This cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button>Delete draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Open dialog' }))

    const dialog = await screen.findByRole('dialog')
    // The title IS the accessible name — Radix warns at runtime without one.
    await expect(dialog).toHaveAccessibleName('Delete this draft?')
    await expect(
      within(dialog).getByRole('button', { name: 'Close' }),
    ).toBeVisible()
    // Portalled out of the story canvas.
    await expect(canvasElement.contains(dialog)).toBe(false)

    // The ✕ closes it. Left open, this story's `hideOthers` sweep would still
    // be live when the next story in the file mounts.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/**
 * `showCloseButton={false}`, the shape `CorvusReplyLink` uses: the panel's own
 * actions already offer a cancel path, so an extra ✕ would be a redesign
 * rather than an affordance.
 */
export const WithoutCloseButton: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Open external link?</Button>
      </DialogTrigger>
      <DialogContent aria-modal="true" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Open external link?</DialogTitle>
          <DialogDescription>
            This link leaves the site and opens in a new tab.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-stretch">
          <DialogClose asChild>
            <Button className="flex-1" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button className="flex-1" variant="teal">
            Open link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Open external link?' })
    await userEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(
      within(dialog).queryByRole('button', { name: 'Close' }),
    ).toBeNull()

    // Focus is INSIDE the panel — Radix's default is the first focusable, so
    // Cancel.
    await expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toHaveFocus()

    // Escape closes it and focus returns to the trigger. Deferred one tick by
    // `FocusScope`'s cleanup (`setTimeout(…, 0)`), hence the `waitFor` — and
    // it only lands at all because the trigger is a `DialogTrigger`.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(trigger).toHaveFocus())
  },
}
