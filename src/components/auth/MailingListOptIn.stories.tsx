import { useState } from 'react'

import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { MAILING_LIST_OPT_IN_LABEL } from '@/lib/email/mailingListOptIn'

import { MailingListOptIn } from './MailingListOptIn'

/**
 * The sign-up screen's mailing-list opt-in (#362), without the Clerk form it
 * sits under: Clerk's `<SignUp>` needs a live instance and cannot mount here.
 */
const meta = {
  title: 'Auth/MailingListOptIn',
  component: MailingListOptIn,
  args: { checked: false, onChange: () => {} },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MailingListOptIn>

export default meta
type Story = StoryObj<typeof meta>

function Stateful() {
  // Starts unticked, as on the sign-up screen.
  const [checked, setChecked] = useState(false)
  return <MailingListOptIn checked={checked} onChange={setChecked} />
}

/** Unticked by default; ticks and unticks from the box and from its label. */
export const Default: Story = {
  render: () => <Stateful />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const box = canvas.getByRole('checkbox', {
      name: MAILING_LIST_OPT_IN_LABEL,
    })
    await expect(box).not.toBeChecked()

    await userEvent.click(box)
    await expect(box).toBeChecked()

    await userEvent.click(canvas.getByText(MAILING_LIST_OPT_IN_LABEL))
    await expect(box).not.toBeChecked()
  },
}

/** The ticked state, for the a11y check and both themes. */
export const Ticked: Story = { args: { checked: true } }
