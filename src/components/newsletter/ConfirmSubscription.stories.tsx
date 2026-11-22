import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { ConfirmSubscription } from './ConfirmSubscription'

/**
 * The confirm button on `/newsletter/confirm`, the Newsletter Signup's
 * double opt-in (#407). These stories pass no token, so pressing Confirm
 * shows the no-token answer without a network call.
 */
const meta = {
  title: 'Newsletter/ConfirmSubscription',
  component: ConfirmSubscription,
  args: { readToken: () => null },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfirmSubscription>

export default meta
type Story = StoryObj<typeof meta>

/** Before the press: one button, an empty live region. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(canvas.getByRole('status')).toBeEmptyDOMElement()
  },
}

/** A link with no token says so, and offers no other way through. */
export const NoToken: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Confirm' }))
    await expect(canvas.getByRole('status')).toHaveTextContent(/doesn't work/i)
  },
}
