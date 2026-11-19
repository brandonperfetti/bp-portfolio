import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * shadcn/ui Input primitive: the base text field for new forms, shown with
 * the Label it is always paired with.
 */
const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  args: { id: 'story-input', placeholder: 'you@example.com' },
  decorators: [
    (Story) => (
      <div className="flex max-w-sm flex-col gap-2">
        <Label htmlFor="story-input">Email address</Label>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Dark: Story = { globals: { theme: 'dark' } }

/** `aria-invalid` alone takes the destructive border and ring. */
export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not-an-email' },
}

export const InvalidDark: Story = {
  ...Invalid,
  globals: { theme: 'dark' },
}

/** A disabled field dims itself, and its `peer` label with it. */
export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'you@example.com' },
}
