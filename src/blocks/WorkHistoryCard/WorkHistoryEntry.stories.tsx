import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import {
  WorkHistoryEntry,
  type WorkHistoryEntryFacts,
} from '@/blocks/WorkHistoryCard/WorkHistoryEntry'

/**
 * A current role, from the real corpus (`/api/work-history`, the same four
 * rows the homepage renders) so the story shows what a `/work/brytecore` page
 * actually renders rather than an invented shape.
 */
const CURRENT_ROLE: WorkHistoryEntryFacts = {
  company: 'Brytecore',
  title: 'Senior Frontend Engineer',
  startYear: '2024',
  endYear: null,
  logoUrl: null,
  description:
    'Building the marketing platform’s front end — design system, performance budget, and the CMS the marketing team ships from.',
}

/** A finished role: a concrete end year rather than "Present". */
const PAST_ROLE: WorkHistoryEntryFacts = {
  company: 'W+R Studios',
  title: 'Senior Data Integrations Engineer',
  startYear: '2012',
  endYear: '2020',
  logoUrl: null,
  description: 'Owned the MLS data pipeline behind Cloud CMA.',
}

/**
 * The per-entry mode of the Work block (#137): one `work-history` row's
 * structured facts, which is what each `/work/<slug>` Page is composed from.
 *
 * The résumé-list mode is not a story here — it is the server `Component`'s
 * other branch, backed by the Local API, and the browser-mode Storybook
 * project stubs that module out (`vitest.config.ts`). This view is the pixel-
 * owning half and takes plain facts, so both themes and every optional field
 * are drivable from args.
 */
const meta = {
  title: 'PageBuilder/WorkHistoryEntry',
  component: WorkHistoryEntry,
  tags: ['autodocs'],
  args: {
    facts: CURRENT_ROLE,
    showDescription: true,
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkHistoryEntry>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default a role page uses: no card chrome, so the company name is the
 * section's own `<h2>`.
 */
export const CurrentRole: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Brytecore' }),
    ).toBeInTheDocument()
    await expect(canvas.getByText('Senior Frontend Engineer')).toBeVisible()
    // A role still held reads "Present" — never a rendered current year, which
    // would be a `Date.now()` read inside a prerendered server component.
    await expect(canvas.getByText(/Present/)).toBeVisible()
    await expect(canvas.getByText(/2024/)).toBeVisible()
  },
}

/** A closed role: both years render as `<time>` elements. */
export const PastRole: Story = {
  args: { facts: PAST_ROLE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.getByText('2012')).toHaveAttribute('datetime', '2012')
    await expect(canvas.getByText('2020')).toHaveAttribute('datetime', '2020')
    await expect(canvas.queryByText(/Present/)).not.toBeInTheDocument()
  },
}

/**
 * With card chrome (#40) the chrome heading owns the `<h2>`, so the company
 * name steps down to `<h3>` rather than competing with it.
 */
export const WithCardChrome: Story = {
  args: {
    heading: 'Where I’ve worked',
    intro: 'The short version. The long version is below.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      canvas.getByRole('heading', { level: 2, name: 'Where I’ve worked' }),
    ).toBeInTheDocument()
    await expect(
      canvas.getByRole('heading', { level: 3, name: 'Brytecore' }),
    ).toBeInTheDocument()
  },
}

/** The editor turned the description off; the facts stay. */
export const WithoutDescription: Story = {
  args: { showDescription: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(
      canvas.queryByText(/Building the marketing platform/),
    ).not.toBeInTheDocument()
    await expect(canvas.getByText('Senior Frontend Engineer')).toBeVisible()
  },
}

/**
 * A logo renders as decorative art: the adjacent company name already carries
 * the accessible identity, so it is `aria-hidden` with an empty `alt` and adds
 * no name to the a11y tree.
 */
export const WithLogo: Story = {
  args: {
    facts: {
      ...CURRENT_ROLE,
      logoUrl:
        'https://res.cloudinary.com/dgwdyrmsn/image/upload/v1774040299/bp-portfolio/logos/footer-brytecore-bug_xsf8iw.webp',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryAllByRole('img')).toHaveLength(0)
    const logo = canvasElement.querySelector('img')
    await expect(logo).toHaveAttribute('alt', '')
    // Cloudinary sources go through the shared transform helper.
    await expect(logo?.getAttribute('src')).toContain('f_auto')
  },
}
