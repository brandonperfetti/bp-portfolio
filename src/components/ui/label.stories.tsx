import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** shadcn/ui Label primitive (Radix): names a field and focuses it on click. */
const meta = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
  args: { htmlFor: 'story-label-field', children: 'Password' },
  decorators: [
    (Story) => (
      <div className="flex max-w-sm flex-col gap-2">
        <Story />
        <Input id="story-label-field" type="password" />
      </div>
    ),
  ],
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

/** Clicking the label focuses the field it names. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByText('Password'))
    await expect(canvas.getByLabelText('Password')).toHaveFocus()
  },
}

export const Dark: Story = { globals: { theme: 'dark' } }
