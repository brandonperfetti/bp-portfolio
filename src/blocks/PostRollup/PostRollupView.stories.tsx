import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import type { ArticleCardItem } from '@/blocks/ArticlesArchive/ArticlesArchiveView'
import { PostRollupView } from '@/blocks/PostRollup/PostRollupView'

/**
 * Forces `(prefers-reduced-motion: reduce)` for one story, before
 * `ScrollReveal`'s `useLayoutEffect` reads `matchMedia` — a `beforeEach`, not
 * a decorator, so the swap lands first. Returns the restore function.
 */
const forceReducedMotion = async () => {
  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia

  return () => {
    window.matchMedia = original
  }
}

const ARTICLES: ArticleCardItem[] = [
  {
    slug: 'what-a-staff-engineer-owns',
    path: 'work/leadership/what-a-staff-engineer-owns',
    title: 'What a staff engineer actually owns',
    date: '2026-08-11',
    description:
      'Scope is not headcount. The job is the decisions nobody else is positioned to make.',
  },
  {
    slug: 'running-a-design-review',
    title: 'Running a design review people want to attend',
    date: '2026-07-02',
    description:
      'An agenda, a written proposal, and the discipline to end on a decision rather than a vibe.',
  },
  {
    slug: 'the-shape-of-a-good-oncall',
    title: 'The shape of a good on-call rotation',
    date: '2026-05-19',
    description:
      'Pager load is a design constraint. Treat it like one and the roadmap changes.',
  },
]

/**
 * Post rollup (#152), presentational — a section page showing *its* articles.
 *
 * `grid` and `stacked` render through `ArticlesArchiveView`, so those stories
 * are here to prove the reuse rather than to re-specify the cards (their own
 * behaviour is pinned in `ArticlesArchiveView.stories.tsx`). `compact-list` is
 * this component's own treatment and gets the detailed coverage.
 */
const meta = {
  title: 'PageBuilder/PostRollup',
  component: PostRollupView,
  tags: ['autodocs'],
  args: {
    articles: ARTICLES,
    heading: 'From the Leadership section',
    layout: 'grid',
  },
  argTypes: {
    layout: {
      control: 'inline-radio',
      options: ['grid', 'stacked', 'compact-list'],
    },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PostRollupView>

export default meta
type Story = StoryObj<typeof meta>

/**
 * The default: the archive block's card grid, unchanged — same whole-card
 * link, same accessible name, same focus ring. The point of the story is that
 * this markup is *not* a second copy of the card.
 */
export const Grid: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = canvasElement.querySelector('.grid')

    await expect(canvas.getAllByRole('article')).toHaveLength(3)
    await expect(grid).toHaveClass('@md:grid-cols-2', '@3xl:grid-cols-3')
    await expect(
      canvas.getByRole('heading', { name: 'From the Leadership section' })
        .tagName,
    ).toBe('H2')
    // A placed article links at its section URL, not at the archive URL.
    await expect(
      canvas.getByRole('link', { name: `Read article: ${ARTICLES[0].title}` }),
    ).toHaveAttribute('href', `/${ARTICLES[0].path}`)
    // An unplaced one keeps `/articles/<slug>`.
    await expect(
      canvas.getByRole('link', { name: `Read article: ${ARTICLES[1].title}` }),
    ).toHaveAttribute('href', `/articles/${ARTICLES[1].slug}`)
  },
}

/** The home page's one-per-row treatment, reached from the rollup. */
export const Stacked: Story = {
  args: { layout: 'stacked' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stack = canvasElement.querySelector('section > div')

    await expect(canvas.getAllByRole('article')).toHaveLength(3)
    await expect(stack).toHaveClass('flex', 'flex-col', 'gap-16')
    await expect(canvas.queryByText(/Browse all articles/)).toBeNull()
  },
}

/**
 * The rollup's own treatment: a dense, dated index for a section page that
 * leads with prose. A real `<ul>` — the list semantics are what tell a screen
 * reader how many entries there are, since these rows are bare links rather
 * than `<article>` landmarks.
 */
export const CompactList: Story = {
  args: { layout: 'compact-list' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    const list = canvas.getByRole('list')
    await expect(list.tagName).toBe('UL')
    await expect(canvas.getAllByRole('listitem')).toHaveLength(3)

    // One link per row, one accessible name per link — the row is not two
    // separate tab stops for a title and a date.
    const links = canvas.getAllByRole('link')
    await expect(links).toHaveLength(3)
    await expect(links[0].textContent).toContain(ARTICLES[0].title)
    await expect(links[0]).toHaveAttribute('href', `/${ARTICLES[0].path}`)
    await expect(links[1]).toHaveAttribute(
      'href',
      `/articles/${ARTICLES[1].slug}`,
    )

    // Focus is visible: the row carries a focus-visible ring, and tabbing
    // reaches exactly the rows.
    links[0].focus()
    await expect(links[0]).toHaveFocus()
    await expect(links[0]).toHaveClass('focus-visible:ring-2')
  },
}

/** Without a heading the list starts flush — no stray leading margin. */
export const CompactListWithoutHeading: Story = {
  args: { layout: 'compact-list', heading: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('heading')).toBeNull()
    const list = canvas.getByRole('list')
    await expect(getComputedStyle(list).marginTop).toBe('0px')
  },
}

/**
 * `revealOnScroll` on, under `prefers-reduced-motion`: the shared
 * `ScrollReveal` wraps the list but renders it static — every row stays
 * visible and reachable.
 */
export const CompactListRevealOnScroll: Story = {
  args: { layout: 'compact-list', revealOnScroll: true },
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = canvas.getAllByRole('listitem')
    await expect(rows).toHaveLength(3)
    for (const row of rows) {
      await expect(Number(getComputedStyle(row).opacity)).toBe(1)
    }
  },
}

/** Nothing to roll up renders nothing at all — no heading, no empty shell. */
export const Empty: Story = {
  args: { articles: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('section')).toBeNull()
    await expect(within(canvasElement).queryByRole('heading')).toBeNull()
  },
}

/**
 * The #40 contract: at root the block carries its own `my-12`; inside a column
 * the stack owns the rhythm and the block emits none.
 */
export const HostedInAColumn: Story = {
  args: { layout: 'compact-list' },
  render: (args) => (
    <div className="space-y-8">
      <div data-testid="root-hosted">
        <PostRollupView {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <PostRollupView {...args} hosted="column" />
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
