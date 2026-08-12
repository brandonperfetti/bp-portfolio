import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'

import { LeadView } from '@/blocks/Lead/LeadView'
import { LEAD_CLASS } from '@/blocks/Lead/lead'

const TEXT =
  "I'm Brandon Perfetti, a product and project manager plus software engineer based in Orange County, California."

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

/**
 * Lead block (#44/W4B1): the about page's plain intro paragraph under its H1 —
 * `text-base text-zinc-600 dark:text-zinc-400`, not the article-body
 * typography the `prose` block renders. The missing surface that let the about
 * page's left column (heading + lead + prose body) be composed on the builder.
 */
const meta = {
  title: 'PageBuilder/Lead',
  component: LeadView,
  tags: ['autodocs'],
  args: { text: TEXT, reveal: false },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LeadView>

export default meta
type Story = StoryObj<typeof meta>

/** The default: a bare paragraph, no reveal wrapper. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const paragraph = canvas.getByText(TEXT)

    // The about page's exact classes ride the wrapping div.
    await expect(paragraph.parentElement).toHaveAttribute('class', LEAD_CLASS)
    // No ScrollReveal wrapper: the div is the top of the rendered tree.
    await expect(canvasElement.querySelector('[data-scroll-reveal]')).toBeNull()
  },
}

/**
 * `reveal: true` — the about page's `ScrollReveal` (y 14, duration 0.72, delay
 * 0.24) now wraps the paragraph, so the lead sits one level deeper than the
 * bare {@link Default}. Under full motion GSAP holds it faded until the scroll
 * trigger fires, so this story asserts the wrapping rather than a frame-timed
 * opacity; {@link RevealReducedMotion} pins the visible-immediately contract.
 */
export const RevealOnScroll: Story = {
  args: { reveal: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const paragraph = canvas.getByText(TEXT)
    const leadDiv = paragraph.parentElement as HTMLElement

    // Same lead node, same classes...
    await expect(leadDiv).toHaveAttribute('class', LEAD_CLASS)
    // ...but now nested inside the ScrollReveal wrapper rather than sitting
    // directly in the decorator column (as it does with the reveal off).
    await expect(leadDiv.parentElement).not.toHaveClass('max-w-2xl')
  },
}

/**
 * §13's rule for every animated surface: with the reveal on but reduced motion
 * requested, the paragraph is fully visible immediately — nothing waits on a
 * tween that will never run.
 */
export const RevealReducedMotion: Story = {
  args: { reveal: true },
  beforeEach: forceReducedMotion,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const paragraph = canvas.getByText(TEXT)

    await expect(paragraph).toBeVisible()
    await expect(Number(getComputedStyle(paragraph).opacity)).toBe(1)
    await expect(getComputedStyle(paragraph).visibility).toBe('visible')
  },
}
