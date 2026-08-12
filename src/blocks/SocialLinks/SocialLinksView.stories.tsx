import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { SocialLinksView } from '@/blocks/SocialLinks/SocialLinksView'
import {
  type ResolvedSocialLink,
  resolveSocialLink,
} from '@/blocks/SocialLinks/platforms'
import { SITE_OWNER_SOCIAL_LINKS } from '@/lib/identity'

/**
 * What `source: identity` resolves to — the Identity global's `sameAs`
 * array, here via the constants that back it when the global is empty, so
 * the story shows the real default set rather than an invented one.
 */
const IDENTITY_LINKS = SITE_OWNER_SOCIAL_LINKS.map(
  (url) => resolveSocialLink(url) as ResolvedSocialLink,
)

/** What `source: custom` resolves to: the block's own array, labels and all. */
const CUSTOM_LINKS = [
  resolveSocialLink('https://github.com/brandonperfetti', 'Read the code'),
  resolveSocialLink('https://instagram.com/brandonperfetti'),
  resolveSocialLink('https://brandonperfetti.com/uses'),
].filter((link): link is ResolvedSocialLink => link !== null)

/**
 * Social links (#32), presentational. Two treatments the site already
 * ships — Home's icon row and About's labeled list — over two sources, so
 * the variant × source matrix is four stories plus the About divider case.
 *
 * The source is a data question, not a visual one: the server component
 * resolves either the Identity global or the block's own array down to the
 * same `links` prop, which is why both appear here as fixtures.
 */
const meta = {
  title: 'PageBuilder/SocialLinks',
  component: SocialLinksView,
  tags: ['autodocs'],
  args: {
    links: IDENTITY_LINKS,
    variant: 'iconRow',
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['iconRow', 'labeledList'] },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SocialLinksView>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Home's treatment: bare glyphs in a row, the link's name carried by
 * `aria-label` because there is no visible text to name it.
 */
export const IconRowFromIdentity: Story = {
  args: { variant: 'iconRow', links: IDENTITY_LINKS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const x = canvas.getByRole('link', { name: 'Follow on X' })

    await expect(x).toHaveAttribute('href', 'https://x.com/brandonperfetti')
    // Off-site links open in a new tab, safely — the site-wide rule.
    await expect(x).toHaveAttribute('target', '_blank')
    await expect(x).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(canvas.getAllByRole('link')).toHaveLength(3)
    // No visible text: the whole treatment is the glyph.
    await expect(x).toHaveTextContent('')
  },
}

export const IconRowFromCustomLinks: Story = {
  args: { variant: 'iconRow', links: CUSTOM_LINKS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // A custom label overrides the derived one even where there is no text.
    await expect(
      canvas.getByRole('link', { name: 'Read the code' }),
    ).toBeInTheDocument()
    // An unrecognized host still renders — with the generic link glyph.
    await expect(
      canvas.getByRole('link', { name: 'brandonperfetti.com' }),
    ).toBeInTheDocument()
  },
}

/** About's treatment: icon plus label, one per line. */
export const LabeledListFromIdentity: Story = {
  args: { variant: 'labeledList', links: IDENTITY_LINKS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = canvas.getAllByRole('listitem')

    await expect(items).toHaveLength(3)
    await expect(items[0]).toHaveTextContent('Follow on X')
    // About's list is flush at the top and spaced by `mt-4` after that.
    await expect(items[0]).not.toHaveClass('mt-4')
    await expect(items[1]).toHaveClass('mt-4')
  },
}

export const LabeledListFromCustomLinks: Story = {
  args: { variant: 'labeledList', links: CUSTOM_LINKS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3)
    await expect(
      canvas.getByRole('link', { name: /Read the code/ }),
    ).toHaveAttribute('href', 'https://github.com/brandonperfetti')
  },
}

/**
 * The About page exactly: the Identity links, then a rule, then the mail
 * row set apart below it.
 */
export const LabeledListWithEmailDivider: Story = {
  args: {
    variant: 'labeledList',
    links: IDENTITY_LINKS,
    email: 'info@brandonperfetti.com',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = canvas.getAllByRole('listitem')
    const mailRow = items[items.length - 1]

    await expect(items).toHaveLength(4)
    await expect(mailRow).toHaveClass('mt-8', 'border-t', 'pt-8')
    await expect(
      within(mailRow).getByRole('link', { name: 'info@brandonperfetti.com' }),
    ).toHaveAttribute('href', 'mailto:info@brandonperfetti.com')
    // A mailto is not off-site — it must not become a new tab.
    await expect(within(mailRow).getByRole('link')).not.toHaveAttribute(
      'target',
    )
  },
}

/**
 * The divider only divides. With no profile links above it the mail row is
 * the whole list, so the rule would be a stray line.
 */
export const EmailOnly: Story = {
  args: {
    variant: 'labeledList',
    links: [],
    email: 'info@brandonperfetti.com',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const [row] = canvas.getAllByRole('listitem')
    await expect(row).not.toHaveClass('border-t')
  },
}

/**
 * No address anywhere — the block sets no override and the Identity global
 * is empty — so the row is simply absent. A state the block could not reach
 * until the field's hard-coded default was dropped (rider on #32, 2026-08-12):
 * the resolution order is block override → Identity `email` → hidden, and
 * this is what "hidden" looks like.
 */
export const LabeledListWithoutEmail: Story = {
  args: { variant: 'labeledList', links: IDENTITY_LINKS, email: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const items = canvas.getAllByRole('listitem')

    await expect(items).toHaveLength(IDENTITY_LINKS.length)
    await expect(canvasElement.querySelector('.border-t')).toBeNull()
    await expect(canvasElement.querySelector('a[href^="mailto:"]')).toBeNull()
  },
}

/**
 * The #40 contract: at root the block carries its own `my-12`; inside a
 * column the stack owns the rhythm and the block emits none.
 */
export const HostedInAColumn: Story = {
  args: { variant: 'iconRow', links: IDENTITY_LINKS, hosted: 'column' },
  render: (args) => (
    <div className="space-y-8">
      <div data-testid="root-hosted">
        <SocialLinksView {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <SocialLinksView {...args} hosted="column" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector(
      '[data-testid="root-hosted"] section',
    )
    const column = canvasElement.querySelector(
      '[data-testid="column-hosted"] section',
    )

    await expect(root).toHaveClass('my-12')
    await expect(column).not.toHaveClass('my-12')
    await expect(getComputedStyle(column as Element).marginTop).toBe('0px')
  },
}
