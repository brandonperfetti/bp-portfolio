import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { ConsentManagerProvider } from '@c15t/react'

import { buildConsentManagerOptions } from '@/components/consent/consent-config'
import { FooterWithNavigation } from '@/components/Footer'
import { PRIMARY_NAV_LINKS } from '@/lib/navigation'

/**
 * The site footer: the header navigation items, then the footer-only links
 * from the `footer` global (#363), then the persistent "Manage Cookies" entry
 * point, with the machine-readable resources row under it.
 *
 * The consent provider is here only because "Manage Cookies" reads it; no
 * script is registered and no banner is mounted.
 */
const meta = {
  title: 'Layout/Footer',
  component: FooterWithNavigation,
  parameters: {
    layout: 'fullscreen',
    nextjs: { navigation: { pathname: '/about' } },
  },
  decorators: [
    (Story) => (
      <ConsentManagerProvider
        options={buildConsentManagerOptions({ scripts: [] })}
      >
        <Story />
      </ConsentManagerProvider>
    ),
  ],
  args: { navigationItems: PRIMARY_NAV_LINKS },
} satisfies Meta<typeof FooterWithNavigation>

export default meta
type Story = StoryObj<typeof meta>

/** What the footer shows while the `footer` global has no links: as before. */
export const NavigationOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = canvas.getByRole('link', { name: 'About' }).parentElement!
    await expect(
      Array.from(row.children).map((child) => child.textContent),
    ).toEqual([
      ...PRIMARY_NAV_LINKS.map((link) => link.label),
      'Manage Cookies',
    ])
  },
}

/** With links saved in the `footer` global: after the nav, before consent. */
export const WithFooterLinks: Story = {
  args: {
    footerLinks: [
      { href: '/privacy', label: 'Privacy' },
      { href: 'https://example.com/elsewhere', label: 'Elsewhere' },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const privacy = canvas.getByRole('link', { name: 'Privacy' })
    await expect(privacy).toHaveAttribute('href', '/privacy')
    await expect(
      Array.from(privacy.parentElement!.children).map(
        (child) => child.textContent,
      ),
    ).toEqual([
      ...PRIMARY_NAV_LINKS.map((link) => link.label),
      'Privacy',
      'Elsewhere',
      'Manage Cookies',
    ])
    await expect(
      canvas.getByRole('link', { name: 'Elsewhere' }),
    ).toHaveAttribute('target', '_blank')
  },
}
