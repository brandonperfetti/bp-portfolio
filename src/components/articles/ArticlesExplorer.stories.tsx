import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import type { ArticleWithSlug } from '@/lib/articles'

const ARTICLES: ArticleWithSlug[] = [
  {
    slug: 'what-a-staff-engineer-owns',
    title: 'What a staff engineer actually owns',
    description:
      'Scope is not headcount. The job is the decisions nobody else is positioned to make.',
    author: 'Brandon Perfetti',
    date: '2026-08-11',
    topics: ['Leadership'],
    tech: ['TypeScript'],
    searchText: 'staff engineer scope decisions',
  },
  {
    slug: 'running-a-design-review',
    title: 'Running a design review people want to attend',
    description:
      'An agenda, a written proposal, and the discipline to end on a decision.',
    author: 'Brandon Perfetti',
    date: '2026-07-02',
    topics: ['Leadership', 'Product'],
    tech: ['Figma'],
    searchText: 'design review agenda decision',
  },
  {
    slug: 'postgres-row-level-security',
    title: 'Row level security, without the footguns',
    description: 'Default deny, then earn every policy you add.',
    author: 'Brandon Perfetti',
    date: '2026-06-18',
    topics: ['Databases'],
    tech: ['PostgreSQL'],
    searchText: 'postgres rls policies default deny',
  },
]

/**
 * The `/articles` explorer. The stories here are about #154 — the
 * "View the ⟨X⟩ section →" affordance — and the invariant it sits next to:
 * **filter chips are state toggles, not links** (#151). Every story asserts
 * both halves, because the whole design risk is the two collapsing into one.
 *
 * `sectionPaths` is a plain, server-resolved object (lowercased category title
 * → published section-home path), so nothing here fetches and the real route
 * stays statically rendered.
 */
const meta = {
  title: 'Articles/ArticlesExplorer',
  component: ArticlesExplorer,
  args: {
    articles: ARTICLES,
    sectionPaths: { leadership: 'work/leadership' },
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ArticlesExplorer>

export default meta
type Story = StoryObj<typeof meta>

/** No filter active: no affordance, and every chip is still a button. */
export const NoFilterActive: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(canvas.queryByRole('link', { name: /View the/ })).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Leadership' }),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('link', { name: 'Leadership' })).toBeNull()
  },
}

/**
 * One category filter active, and that category has a published home: the link
 * appears, spelled `View the Leadership section →` with the arrow hidden from
 * assistive tech, and it points at the section URL.
 */
export const CategoryWithASectionHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Leadership' }))

    const link = await waitFor(() =>
      canvas.getByRole('link', { name: 'View the Leadership section' }),
    )
    await expect(link).toHaveAttribute('href', '/work/leadership')
    // The arrow is decoration: visible, and out of the accessible name.
    await expect(link.textContent).toContain('→')
    await expect(link.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      '→',
    )

    // It does not come between two chips: within the filter card the chips are
    // one uninterrupted run and the link is the last focusable thing in it.
    const card = link.closest('.space-y-4') as HTMLElement
    const focusables = Array.from(
      card.querySelectorAll<HTMLElement>('button, a[href], input'),
    )
    await expect(focusables.at(-1)).toBe(link)
    await expect(
      focusables.slice(0, -1).every((el) => el.tagName !== 'A'),
    ).toBe(true)

    // The chip that produced it is still a button, and still does not navigate.
    await expect(
      canvas.getByRole('button', { name: 'Leadership' }),
    ).toBeInTheDocument()
  },
}

/** A category with no home: filtering works, the affordance stays away. */
export const CategoryWithoutASectionHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Databases' }))

    await waitFor(async () => {
      await expect(
        canvas.getByText('Row level security, without the footguns'),
      ).toBeInTheDocument()
    })
    await expect(canvas.queryByRole('link', { name: /View the/ })).toBeNull()
  },
}

/**
 * Filtering on a tag whose name matches nothing in the map: no affordance.
 *
 * `PostgreSQL` is a tag, and no category is called that, so the lookup misses —
 * which is the ordinary outcome for a tag, since only categories can have a
 * home. The miss is silent: no link, no fallback, no empty state.
 */
export const TagWithNoMatchingSection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'PostgreSQL' }))

    await expect(canvas.queryByRole('link', { name: /View the/ })).toBeNull()
  },
}

/**
 * The collision, pinned: a **tag** named exactly like a homed category, on a
 * corpus where no article carries that name as a *topic* — so the chip comes
 * purely from the tag half of the pool.
 *
 * **The affordance is shown, and that is intended.** The reader filtered on
 * "Leadership" and a section called Leadership exists; sending them there is
 * right whichever pool the chip came from, and the link is honest about where
 * it goes. Hiding it would mean knowing each chip's provenance, which the
 * filter pool deliberately does not carry — it merges topic and tag names into
 * one flat, deduped `string[]` — so buying that knowledge means widening the
 * pool from strings to objects and rippling through the matcher, the chip
 * counting and their tests, to make a correct link disappear.
 */
export const TagNameCollidingWithAHomedSection: Story = {
  args: {
    articles: [
      {
        slug: 'a-tag-named-leadership',
        title: 'Notes from a team that ran itself',
        description: 'Filed under databases, tagged leadership.',
        author: 'Brandon Perfetti',
        date: '2026-05-04',
        // No article here carries Leadership as a *topic* — the chip below can
        // only have come from `tech`.
        topics: ['Databases'],
        tech: ['Leadership'],
        searchText: 'self-managing team notes',
      },
    ],
    sectionPaths: { leadership: 'work/leadership' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Leadership' }))

    const link = await waitFor(() =>
      canvas.getByRole('link', { name: 'View the Leadership section' }),
    )
    await expect(link).toHaveAttribute('href', '/work/leadership')
  },
}

/** Deselecting the filter takes the affordance away again. */
export const ClearingTheFilterHidesIt: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Leadership' }))
    await waitFor(() =>
      canvas.getByRole('link', { name: 'View the Leadership section' }),
    )

    await userEvent.click(canvas.getByRole('button', { name: 'All' }))
    await waitFor(async () => {
      await expect(canvas.queryByRole('link', { name: /View the/ })).toBeNull()
    })
  },
}

/** No topic has a home at all — the ordinary state, and the default. */
export const NoTopicHasAHome: Story = {
  args: { sectionPaths: {} },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Leadership' }))

    await expect(canvas.queryByRole('link', { name: /View the/ })).toBeNull()
  },
}
