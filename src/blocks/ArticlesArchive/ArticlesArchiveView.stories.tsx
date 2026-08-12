import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import {
  type ArticleCardItem,
  ArticlesArchiveView,
} from '@/blocks/ArticlesArchive/ArticlesArchiveView'

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
    slug: 'shipping-a-page-builder',
    title: 'Shipping a page builder without shipping a redesign',
    date: '2026-08-01',
    description:
      'Every block in the library is a treatment the site already had. The work is finding them, not inventing them.',
  },
  {
    slug: 'container-queries-in-anger',
    title: 'Container queries in anger',
    date: '2026-07-14',
    description:
      'A grid that counts columns off the viewport is wrong the moment it stops owning the viewport.',
  },
  {
    slug: 'the-cost-of-a-migration',
    title: 'The cost of a migration nobody notices',
    date: '2026-06-28',
    description:
      'Additive schema changes, a parity harness, and the discipline to keep both copies until the flip.',
  },
  {
    slug: 'reduced-motion-is-a-feature',
    title: 'Reduced motion is a feature, not a fallback',
    date: '2026-06-02',
    description:
      'Animation that degrades to static, functional DOM is the only animation worth shipping.',
  },
]

/**
 * Articles archive (#34), presentational. One block, two treatments the site
 * already had: the card grid it has always rendered, and the home page's
 * stacked list — hover overlay, full-card link — which was hard-coded in the
 * route and unreachable from the CMS.
 */
const meta = {
  title: 'PageBuilder/ArticlesArchive',
  component: ArticlesArchiveView,
  tags: ['autodocs'],
  args: {
    articles: ARTICLES.slice(0, 3),
    variant: 'grid',
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['grid', 'stacked'] },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArticlesArchiveView>

export default meta
type Story = StoryObj<typeof meta>

/** The treatment every seeded page already renders — unchanged by #34. */
export const Grid: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const grid = canvasElement.querySelector('.grid')

    await expect(canvas.getAllByRole('article')).toHaveLength(3)
    // Cards pair at @md and go three-up at @3xl — off the block's own box,
    // never the viewport (see hostContext.ts).
    await expect(grid).toHaveClass('@md:grid-cols-2', '@3xl:grid-cols-3')
    await expect(
      canvas.getByRole('link', { name: /Browse all articles/ }),
    ).toHaveAttribute('href', '/articles')
    // The grid links from the card title, not from the whole card.
    await expect(
      canvas.getByRole('link', { name: ARTICLES[0].title }),
    ).toHaveAttribute('href', `/articles/${ARTICLES[0].slug}`)
  },
}

/** A heading is optional; when present it sits above the grid at `mt-8`. */
export const GridWithHeading: Story = {
  args: { heading: 'From the blog' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const heading = canvas.getByRole('heading', { name: 'From the blog' })
    await expect(heading.tagName).toBe('H2')
  },
}

/**
 * The home page's list, as the block now renders it: one row per article,
 * `gap-16` between rows, an inset overlay behind each card and a link
 * covering the whole thing. The route still renders its own copy until #42 —
 * `homeParity.test.ts` is what keeps the two identical.
 */
export const Stacked: Story = {
  args: { variant: 'stacked', articles: ARTICLES },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const stack = canvasElement.querySelector('section > div')

    await expect(canvas.getAllByRole('article')).toHaveLength(4)
    await expect(stack).toHaveClass('flex', 'flex-col', 'gap-16')
    // Flush to the top of its column: no heading, no leading margin.
    await expect(getComputedStyle(stack as Element).marginTop).toBe('0px')

    const fullCardLink = canvas.getByRole('link', {
      name: `Read article: ${ARTICLES[0].title}`,
    })
    await expect(fullCardLink).toHaveAttribute(
      'href',
      `/articles/${ARTICLES[0].slug}`,
    )
    // "Whole card clickable" is a geometric claim, so measure it: the link
    // box has to cover the card box it sits in.
    const card = canvas.getAllByRole('article')[0]
    const linkBox = fullCardLink.getBoundingClientRect()
    const cardBox = card.getBoundingClientRect()
    await expect(linkBox.top).toBeLessThanOrEqual(cardBox.top)
    await expect(linkBox.bottom).toBeGreaterThanOrEqual(cardBox.bottom)
    await expect(linkBox.left).toBeLessThanOrEqual(cardBox.left)
    await expect(linkBox.right).toBeGreaterThanOrEqual(cardBox.right)

    // There is no browse-all link in this treatment — the home page has none.
    await expect(canvas.queryByText(/Browse all articles/)).toBeNull()
  },
}

/**
 * The hover overlay, which is the treatment's whole point: it starts
 * invisible and the shared `HoverMotionCard` fades it in. Asserted through a
 * real pointer event rather than by reading a class, because the fade is
 * GSAP's, not Tailwind's.
 */
export const StackedHoverOverlay: Story = {
  args: { variant: 'stacked', articles: ARTICLES.slice(0, 2) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const card = canvas.getAllByRole('article')[0]
    const overlay = card.querySelector('[data-hover-overlay]') as HTMLElement

    await expect(overlay).toHaveClass('bg-zinc-50', 'sm:rounded-2xl')
    await expect(Number(getComputedStyle(overlay).opacity)).toBe(0)

    await userEvent.hover(card.parentElement as HTMLElement)
    await waitFor(async () => {
      await expect(Number(getComputedStyle(overlay).opacity)).toBeGreaterThan(0)
    })
  },
}

/**
 * The stacked list with `revealOnScroll` OFF (the default): no `ScrollReveal`
 * wrapper in the tree — `section > div` is the list itself. Byte-identical to
 * the list the block has always rendered.
 */
export const StackedRevealOff: Story = {
  args: { variant: 'stacked', articles: ARTICLES.slice(0, 3) },
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector('section > div')
    await expect(list).toHaveClass('flex', 'flex-col', 'gap-16')
  },
}

/**
 * The stacked list with `revealOnScroll` ON, under `prefers-reduced-motion`:
 * the homepage's `ScrollReveal` wraps the list (so `section > div` is now the
 * reveal wrapper and the list is one level deeper), but the reveal renders
 * static — every article stays visible. On honours reduced motion via the
 * shared component; off emits no wrapper at all (see {@link StackedRevealOff}).
 */
export const StackedRevealOnScroll: Story = {
  args: {
    variant: 'stacked',
    articles: ARTICLES.slice(0, 3),
    revealOnScroll: true,
  },
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The reveal wrapper is interposed: the list is nested inside it now.
    const list = canvasElement.querySelector('section > div > div.flex')
    await expect(list).toHaveClass('flex', 'flex-col', 'gap-16')

    // Reduced motion: nothing is left faded out.
    const articles = canvas.getAllByRole('article')
    await expect(articles).toHaveLength(3)
    for (const article of articles) {
      await expect(Number(getComputedStyle(article).opacity)).toBe(1)
    }
  },
}

/** Both treatments, side by side, so a drift in either is visible at a glance. */
export const VariantMatrix: Story = {
  render: (args) => (
    <div className="grid grid-cols-2 gap-10">
      <div data-testid="grid">
        <ArticlesArchiveView {...args} variant="grid" heading="Card grid" />
      </div>
      <div data-testid="stacked">
        <ArticlesArchiveView
          {...args}
          variant="stacked"
          heading="Stacked list"
        />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const grid = canvasElement.querySelector('[data-testid="grid"] .grid')
    const stacked = canvasElement.querySelector(
      '[data-testid="stacked"] section > div',
    )

    await expect(grid).not.toBeNull()
    await expect(stacked).toHaveClass('gap-16')
    // With a heading, the stack picks up the grid's `mt-8` rhythm.
    await expect(stacked).toHaveClass('mt-8')
  },
}

/**
 * The #40 contract: at root the block carries its own `my-12`; inside a
 * column the stack owns the rhythm and the block emits none. The stacked
 * variant is the one an editor reaches for in a column — it is how the home
 * page's own two-column layout uses this list.
 */
export const HostedInAColumn: Story = {
  args: { variant: 'stacked', articles: ARTICLES.slice(0, 2) },
  render: (args) => (
    <div className="space-y-8">
      <div data-testid="root-hosted">
        <ArticlesArchiveView {...args} hosted={undefined} />
      </div>
      <div data-testid="column-hosted">
        <ArticlesArchiveView {...args} hosted="column" />
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
