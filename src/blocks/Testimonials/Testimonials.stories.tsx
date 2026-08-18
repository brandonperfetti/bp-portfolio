import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import type { SwiperClass } from 'swiper/react'

import { TestimonialsComponent } from '@/blocks/Testimonials/Component'
import type { Media, TestimonialsBlock } from '@/payload-types'

/**
 * The Testimonials block (#61), both layouts. `grid` is the unchanged default
 * card grid; `carousel` is the "Cards Stack" deck — Swiper `EffectCards`
 * reconciled to the zinc/teal figure chrome. These stories are the block's
 * visual surface and the carousel's behaviour proof (instance-ref navigation,
 * always-on keyboard, brand-teal pagination); the pure autoplay-off and
 * reduced-motion contracts are proven deterministically in `deck.test.ts`.
 */
const avatar = (seed: string): Media =>
  ({
    id: 1,
    url: `https://picsum.photos/seed/${seed}/80/80`,
    alt: '',
    width: 80,
    height: 80,
  }) as Media

const ITEMS: NonNullable<TestimonialsBlock['items']> = [
  {
    id: '1',
    quote:
      'Brandon rebuilt our page-builder from the ground up and it just works.',
    name: 'Ada Lovelace',
    role: 'CTO, Analytical Engines',
    avatar: avatar('bp-testimonial-1'),
  },
  {
    id: '2',
    quote: 'The carousel work shipped ahead of schedule and on-brand.',
    name: 'Grace Hopper',
    role: 'VP Engineering, Nanosecond',
    avatar: avatar('bp-testimonial-2'),
  },
  {
    id: '3',
    quote: 'Accessible, reduced-motion-safe, and pixel-tidy in both themes.',
    name: 'Katherine Johnson',
    role: 'Principal, Orbital',
    avatar: avatar('bp-testimonial-3'),
  },
]

const meta = {
  title: 'PageBuilder/Testimonials',
  component: TestimonialsComponent,
  tags: ['autodocs'],
  args: {
    blockType: 'testimonials',
    heading: 'What people say',
    items: ITEMS,
    layout: 'grid',
  } as TestimonialsBlock,
  argTypes: {
    layout: { control: 'inline-radio', options: ['grid', 'carousel'] },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TestimonialsComponent>

export default meta
type Story = StoryObj<typeof meta>

/** Read the live Swiper instance off its container (Swiper attaches it there). */
async function getSwiper(canvasElement: HTMLElement): Promise<SwiperClass> {
  const el = canvasElement.querySelector('.swiper') as
    (HTMLElement & { swiper?: SwiperClass }) | null
  return waitFor(() => {
    if (!el?.swiper) throw new Error('swiper not ready')
    return el.swiper
  })
}

// ── layouts (the visual axis) ────────────────────────────────────────────────

/** grid — the default: today's responsive card grid, unchanged. */
export const GridLayout: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The default layout is a real list of cards, not a Swiper track.
    await expect(canvas.getByRole('list')).toBeInTheDocument()
    await expect(
      canvasElement.querySelector('[data-testid="testimonials-carousel"]'),
    ).toBeNull()
  },
}

/** carousel — the "Cards Stack" deck driven by Swiper `EffectCards`. */
export const CarouselLayout: Story = {
  args: { layout: 'carousel' },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    // The stacked deck mounts EffectCards when motion is allowed (the default).
    await expect(swiper.params.effect).toBe('cards')
    await expect(
      canvasElement.querySelector('[data-testid="testimonials-carousel"]'),
    ).not.toBeNull()
  },
}

// ── carousel behaviour (the interaction axis) ────────────────────────────────

/**
 * Instance-ref navigation: the custom Next arrow calls `slideNext()` on the
 * captured instance (no deprecated `prevEl/nextEl` selector coupling), and the
 * active index advances, then retreats on Previous.
 */
export const CarouselNavigation: Story = {
  args: { layout: 'carousel' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.realIndex).toBe(0))

    await userEvent.click(
      canvas.getByRole('button', { name: 'Next testimonial' }),
    )
    await waitFor(() => expect(swiper.realIndex).toBe(1))

    await userEvent.click(
      canvas.getByRole('button', { name: 'Previous testimonial' }),
    )
    await waitFor(() => expect(swiper.realIndex).toBe(0))
  },
}

/**
 * Keyboard navigation is always wired: the keyboard module is enabled on the
 * instance regardless of the other knobs, and the arrows are real, tabbable
 * buttons.
 */
export const CarouselKeyboardEnabled: Story = {
  args: { layout: 'carousel' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swiper = await getSwiper(canvasElement)

    await expect(swiper.keyboard?.enabled).toBe(true)
    await expect(
      canvas.getByRole('button', { name: 'Next testimonial' }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Previous testimonial' }),
    ).toBeEnabled()
  },
}

/**
 * Brand-token pagination (inherits #66): the active bullet is the site's teal
 * accent — the resolved `--color-teal-500` token, never Swiper's default blue
 * (`#007aff` / `rgb(0, 122, 255)`).
 */
export const CarouselPaginationBranded: Story = {
  args: { layout: 'carousel' },
  play: async ({ canvasElement }) => {
    const container = canvasElement.querySelector(
      '[data-testid="testimonials-carousel"]',
    ) as HTMLElement

    const active = await waitFor(() => {
      const el = container.querySelector('.swiper-pagination-bullet-active')
      if (!el) throw new Error('no active bullet yet')
      return el as HTMLElement
    })

    // Resolve the brand token to the rgb the browser paints, via a probe, so
    // the assertion tracks the theme instead of hard-coding an oklch/rgb value.
    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--color-teal-500)'
    document.body.appendChild(probe)
    const teal = getComputedStyle(probe).backgroundColor
    probe.remove()

    const activeBg = getComputedStyle(active).backgroundColor
    await expect(activeBg).toBe(teal)
    await expect(activeBg).not.toBe('rgb(0, 122, 255)')

    await expect(
      getComputedStyle(container)
        .getPropertyValue('--swiper-theme-color')
        .trim().length,
    ).toBeGreaterThan(0)
  },
}
