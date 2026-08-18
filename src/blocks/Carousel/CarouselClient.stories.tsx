import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import type { SwiperClass } from 'swiper/react'

import {
  CarouselClient,
  type CarouselSlideData,
} from '@/blocks/Carousel/CarouselClient'

/**
 * Force `prefers-reduced-motion: reduce` to match for the duration of a story,
 * so the reduced-motion branch can be exercised in the browser without a real
 * OS preference. Used from a story's `beforeEach` (which runs before the render,
 * so the leaf's `useLayoutEffect` reads the patched value) and whose returned
 * cleanup restores the original. Only the reduced-motion query is patched; every
 * other `matchMedia` call passes through untouched. Kept out of component render
 * on purpose — mutating a global there is disallowed (`react-hooks/immutability`).
 *
 * @returns A restore function to call on cleanup.
 */
function forceReducedMotion(): () => void {
  const original = window.matchMedia.bind(window)
  window.matchMedia = ((query: string) => {
    const result = original(query)
    if (query.includes('prefers-reduced-motion')) {
      return {
        ...result,
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList
    }
    return result
  }) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

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
    effect: { control: 'inline-radio', options: ['slide', 'fade', 'expo'] },
    direction: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    rotate: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    grayscale: { control: 'boolean' },
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

/**
 * media × expo — the ported UI-Initiative parallax + scale showcase (#62): a
 * centred, fractional track where the neighbouring photos scale and parallax as
 * they leave the centre and desaturate (a deliberate zinc-brand choice).
 */
export const MediaExpo: Story = {
  args: { variant: 'media', effect: 'expo' },
}

// ── expo behaviour (the #62 interaction axis) ────────────────────────────────

/**
 * Effect-mounted (the React-availability + Swiper-14 receipt): with motion
 * allowed the Expo module actually mounts on the installed Swiper — the
 * instance reports `effect: 'expo'`, the container carries the `swiper-expo`
 * modifier class, the custom `expoEffect` params are installed, and the
 * effect's `setTranslate` has written a real transform onto an `.expo-image`.
 */
export const ExpoEffectMounted: Story = {
  args: { variant: 'media', effect: 'expo' },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)

    await waitFor(() => expect(swiper.params.effect).toBe('expo'))
    await expect(
      (swiper.params as { expoEffect?: { grayscale?: boolean } }).expoEffect
        ?.grayscale,
    ).toBe(true)

    const container = canvasElement.querySelector('.swiper') as HTMLElement
    await expect(container.classList.contains('swiper-expo')).toBe(true)

    // The required per-slide DOM is emitted on the transformed elements…
    const image = await waitFor(() => {
      const el = canvasElement.querySelector('.expo-container .expo-image')
      if (!el) throw new Error('no expo image yet')
      return el as HTMLElement
    })
    // …and the effect has driven a transform onto it (proof it runs on Swiper 14).
    await waitFor(() =>
      expect(image.style.transform).toEqual(expect.stringContaining('scale')),
    )
  },
}

/** Instance-ref navigation works with the expo effect just as with a plain track. */
export const ExpoNavigation: Story = {
  args: { variant: 'media', effect: 'expo' },
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

/** Keyboard nav stays wired under the expo effect (an AC of #41 the effect must not regress). */
export const ExpoKeyboardEnabled: Story = {
  args: { variant: 'media', effect: 'expo' },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await expect(swiper.keyboard?.enabled).toBe(true)
  },
}

/**
 * Reduced-motion degrade (#62 AC): with the platform preference forced to
 * reduce, expo collapses to a plain `slide` in the mapper — so the Expo module
 * is NOT mounted (`effect !== 'expo'`), the `swiper-expo` class is absent, and
 * none of the expo DOM (`.expo-image`) is emitted. The media slide renders as a
 * plain static image. The deterministic collapse itself is also unit-proven in
 * `options.test.ts`.
 */
export const ExpoReducedMotionDegrades: Story = {
  args: { variant: 'media', effect: 'expo' },
  beforeEach: () => forceReducedMotion(),
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    const container = canvasElement.querySelector('.swiper') as HTMLElement

    await waitFor(() => expect(swiper.params.effect).not.toBe('expo'))
    await expect(container.classList.contains('swiper-expo')).toBe(false)
    await expect(canvasElement.querySelector('.expo-image')).toBeNull()
    await expect(canvasElement.querySelector('.expo-container')).toBeNull()
  },
}

/**
 * Vertical expo (#62 addendum): `direction: 'vertical'` mounts a vertical
 * parallax track. The bounded height treatment (`h-[70vh]` capped) keeps the
 * slides from collapsing to zero — the Swiper and its slides have real height —
 * and nothing spills horizontally (the effect's cross-axis padding lives inside
 * `box-sizing: border-box`, so 0 horizontal overflow at the rendered width; the
 * same holds at 1512/768/390 by the vh/min/max + overflow-hidden construction).
 */
export const MediaExpoVertical: Story = {
  args: { variant: 'media', effect: 'expo', direction: 'vertical' },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    const container = canvasElement.querySelector('.swiper') as HTMLElement

    await waitFor(() => expect(swiper.params.direction).toBe('vertical'))
    await expect(container.classList.contains('swiper-vertical')).toBe(true)

    // Bounded height applied → neither the track nor its slides collapse.
    await waitFor(() =>
      expect(container.clientHeight).toBeGreaterThanOrEqual(1),
    )
    await expect(container.clientHeight).toBeGreaterThan(300)
    const slide = canvasElement.querySelector('.swiper-slide') as HTMLElement
    await expect(slide.clientHeight).toBeGreaterThan(0)
    // The expo DOM is on the transformed elements.
    await expect(
      canvasElement.querySelector('.expo-container .expo-image'),
    ).not.toBeNull()

    // Swiper clips its own track, and the page never scrolls horizontally.
    await expect(getComputedStyle(container).overflow).toBe('hidden')
    const doc = document.documentElement
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth + 1)
  },
}

/**
 * Rotated expo (#62 addendum): the editor's `rotate` angle reaches the effect —
 * `swiper.params.expoEffect.rotate` carries it — and the effect writes a
 * `rotateY(...)` onto the scaled `.expo-container`. No horizontal overflow.
 */
export const MediaExpoRotated: Story = {
  args: { variant: 'media', effect: 'expo', rotate: 30 },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)

    await waitFor(() =>
      expect(
        (swiper.params as { expoEffect?: { rotate?: number } }).expoEffect
          ?.rotate,
      ).toBe(30),
    )

    // The effect drives a rotateY transform on the containers (0° on the
    // centred slide, non-zero on the neighbours).
    await waitFor(() => {
      const containers = Array.from(
        canvasElement.querySelectorAll('.expo-container'),
      ) as HTMLElement[]
      expect(
        containers.some((el) => el.style.transform.includes('rotateY(')),
      ).toBe(true)
    })

    const doc = document.documentElement
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth + 1)
  },
}

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

/**
 * Brand-token pagination (#66): the active bullet is the site's teal accent —
 * the resolved `--color-teal-500` token, never Swiper's default blue
 * (`#007aff` / `rgb(0, 122, 255)`) that staging QA found leaking through.
 */
export const PaginationBranded: Story = {
  args: { navigation: false, pagination: true },
  play: async ({ canvasElement }) => {
    const container = canvasElement.querySelector(
      '[data-testid="carousel"]',
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

    // The theme override is present so no default blue leaks from Swiper.
    await expect(
      getComputedStyle(container)
        .getPropertyValue('--swiper-theme-color')
        .trim().length,
    ).toBeGreaterThan(0)
  },
}
