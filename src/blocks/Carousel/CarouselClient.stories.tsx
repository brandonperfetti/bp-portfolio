import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import type { SwiperClass } from 'swiper/react'

import {
  CarouselClient,
  type CarouselSlideData,
} from '@/blocks/Carousel/CarouselClient'

/**
 * The generic carousel leaf (#41), presentational. These stories are the
 * block's visual surface (the demo/lab Pages doc is composed later in staging)
 * and its behaviour proof: one story per `variant × effect`, plus interaction
 * tests for instance-ref navigation, autoplay pause-on-hover, and the
 * always-on keyboard wiring.
 */
const SLIDES: CarouselSlideData[] = [
  {
    id: '1',
    src: 'https://picsum.photos/seed/bp-carousel-1/1200/800',
    alt: 'Placeholder one',
    title: 'First slide',
    text: 'A generic card mapping CMS options onto Swiper.',
  },
  {
    id: '2',
    src: 'https://picsum.photos/seed/bp-carousel-2/1200/800',
    alt: 'Placeholder two',
    title: 'Second slide',
    text: 'Cards render an image with a title and text.',
  },
  {
    id: '3',
    src: 'https://picsum.photos/seed/bp-carousel-3/1200/800',
    alt: 'Placeholder three',
    title: 'Third slide',
    text: 'Media renders the image edge-to-edge.',
  },
  {
    id: '4',
    src: 'https://picsum.photos/seed/bp-carousel-4/1200/800',
    alt: 'Placeholder four',
    title: 'Fourth slide',
    text: 'Every knob is CMS-configurable.',
  },
]

const meta = {
  title: 'PageBuilder/Carousel',
  component: CarouselClient,
  tags: ['autodocs'],
  args: {
    variant: 'cards',
    slides: SLIDES,
    slidesPerView: 1,
    slidesPerViewMobile: 1,
    effect: 'slide',
    loop: false,
    navigation: true,
    pagination: true,
    autoplay: false,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['cards', 'media'] },
    effect: { control: 'inline-radio', options: ['slide', 'fade'] },
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CarouselClient>

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

// ── variant × effect (the visual axis) ──────────────────────────────────────

/** cards × slide — the default: a card track that translates. */
export const CardsSlide: Story = {}

/** cards × fade — one card cross-fading (fade forces a single slide per view). */
export const CardsFade: Story = { args: { effect: 'fade' } }

/** media × slide — an edge-to-edge image track. */
export const MediaSlide: Story = { args: { variant: 'media' } }

/** media × fade — a single image cross-fading. */
export const MediaFade: Story = { args: { variant: 'media', effect: 'fade' } }

// ── interaction (the behaviour axis) ─────────────────────────────────────────

/**
 * Instance-ref navigation: the custom Next arrow calls `slideNext()` on the
 * captured instance (no deprecated `prevEl/nextEl` selector coupling), and the
 * active index advances.
 */
export const Navigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.realIndex).toBe(0))

    await userEvent.click(canvas.getByRole('button', { name: 'Next slide' }))
    await waitFor(() => expect(swiper.realIndex).toBe(1))

    await userEvent.click(
      canvas.getByRole('button', { name: 'Previous slide' }),
    )
    await waitFor(() => expect(swiper.realIndex).toBe(0))
  },
}

/**
 * Autoplay pause-on-hover: with autoplay on, the loop runs, and a pointer over
 * the track pauses it (so a reader can dwell), resuming on pointer-leave.
 * Autoplay-off-by-default and reduced-motion suppression are proven
 * deterministically in `options.test.ts`.
 */
export const AutoplayPauses: Story = {
  args: { autoplay: true, interval: 1500, loop: true },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    const track = canvasElement.querySelector('.swiper') as HTMLElement

    await waitFor(() => expect(swiper.autoplay?.running).toBe(true))

    // Swiper's pause-on-hover only reacts to a mouse pointer, so the synthetic
    // event must carry pointerType 'mouse' or the handler bails.
    fireEvent.pointerEnter(track, { pointerType: 'mouse' })
    await waitFor(() => expect(swiper.autoplay?.paused).toBe(true))

    fireEvent.pointerLeave(track, { pointerType: 'mouse' })
    await waitFor(() => expect(swiper.autoplay?.paused).toBe(false))
  },
}

/**
 * Keyboard navigation is always wired (an AC of #41): the keyboard module is
 * enabled on the instance regardless of the other knobs, and the arrows are
 * real, tabbable buttons.
 */
export const KeyboardEnabled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swiper = await getSwiper(canvasElement)

    await expect(swiper.keyboard?.enabled).toBe(true)
    await expect(
      canvas.getByRole('button', { name: 'Next slide' }),
    ).toBeEnabled()
    await expect(
      canvas.getByRole('button', { name: 'Previous slide' }),
    ).toBeEnabled()
  },
}
