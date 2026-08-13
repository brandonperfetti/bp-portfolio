import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ArticleMeta } from '@/components/cms/ArticleMeta'

/**
 * Article byline (#25/W5B1). Resolves a single {@link ArticleMeta} `author`
 * from a post's populated `authors` relation. The two authorship fixtures the
 * ticket calls for:
 *
 * - {@link SiteOwner} — the single-author (site-owner) byline: name links to
 *   `/about`, role beneath, no avatar or social links.
 * - {@link GuestAuthor} — a second (guest) Author doc: avatar, role, and social
 *   links (the `sameAs` set that also feeds Article JSON-LD).
 */
const meta = {
  title: 'CMS/ArticleMeta',
  component: ArticleMeta,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArticleMeta>

export default meta
type Story = StoryObj<typeof meta>

/** 1-author fixture: the site owner, linked to /about, name + role only. */
export const SiteOwner: Story = {
  args: {
    author: {
      name: 'Brandon Perfetti',
      role: 'Technical PM + Software Engineer',
      href: '/about',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const link = canvas.getByRole('link', { name: 'Brandon Perfetti' })
    await expect(link).toHaveAttribute('href', '/about')
    await expect(
      canvas.getByText('Technical PM + Software Engineer'),
    ).toBeVisible()
    // Single-author byline: no avatar, no social links.
    await expect(canvasElement.querySelector('img')).toBeNull()
  },
}

/**
 * 2-author fixture: a guest Author alongside the site owner. Renders the
 * guest's avatar, role, and social links — the enriched byline the collection
 * unlocks.
 */
export const GuestAuthor: Story = {
  args: {
    author: {
      name: 'Ada Lovelace',
      role: 'Guest Author',
      image: 'https://placehold.co/80x80/14b8a6/ffffff/png?text=AL',
      sameAs: [
        'https://github.com/adalovelace',
        'https://x.com/adalovelace',
        'https://www.linkedin.com/in/adalovelace/',
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('Ada Lovelace')).toBeVisible()
    await expect(canvas.getByText('Guest Author')).toBeVisible()

    const avatar = canvasElement.querySelector('img')
    await expect(avatar).not.toBeNull()
    await expect(avatar).toHaveAttribute('aria-hidden', 'true')

    // Socials render as brand icons (shared SOCIAL_PLATFORM_ICONS set); the
    // accessible name comes from the resolver's label via aria-label.
    const github = canvas.getByRole('link', { name: 'Follow on GitHub' })
    await expect(github).toHaveAttribute(
      'href',
      'https://github.com/adalovelace',
    )
    await expect(github).toHaveAttribute('target', '_blank')
    await expect(github.querySelector('svg')).not.toBeNull()
    await expect(
      canvas.getByRole('link', { name: 'Follow on X' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('link', { name: 'Follow on LinkedIn' }),
    ).toBeVisible()
  },
}
