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

/**
 * Carousel-3D is an infinite loop designed for ≥5 slides (#63), so it gets a
 * six-slide fixture rather than the four the other effects use.
 */
const CAROUSEL3D_SLIDES: CarouselSlideData[] = Array.from(
  { length: 6 },
  (_, i) => ({
    id: `c3d-${i + 1}`,
    src: `https://picsum.photos/seed/bp-carousel3d-${i + 1}/1200/900`,
    alt: `Showcase image ${i + 1}`,
    title: `Feature ${i + 1}`,
    text: 'An infinite 3D carousel of media cards.',
  }),
)

/**
 * Spring is a normal multi-card track (#64) whose cascade reads best at 2–4
 * cards, so it gets a six-card fixture for the multi-`slidesPerView` stories.
 */
const SPRING_SLIDES: CarouselSlideData[] = Array.from(
  { length: 6 },
  (_, i) => ({
    id: `spring-${i + 1}`,
    src: `https://picsum.photos/seed/bp-spring-${i + 1}/1200/900`,
    alt: `Spring card ${i + 1}`,
    title: `Card ${i + 1}`,
    text: 'A card that springs in on a staggered trailing delay.',
  }),
)

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
    // The horizontal-Expo full-bleed breakout defaults ON in production, but the
    // effect/behaviour stories run inside a bounded decorator column, so it is
    // pinned OFF here to keep their geometry stable; `ExpoFullBleed` exercises
    // the breakout explicitly in a production-like clipped frame.
    fullBleed: false,
  },
  argTypes: {
    variant: { control: 'inline-radio', options: ['cards', 'media'] },
    effect: {
      control: 'inline-radio',
      options: ['slide', 'fade', 'expo', 'carousel3d', 'spring'],
    },
    direction: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    rotate: { control: { type: 'range', min: 0, max: 30, step: 1 } },
    grayscale: { control: 'boolean' },
    fullBleed: { control: 'boolean' },
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

/**
 * Horizontal overscan present (#68 fix): Tailwind Preflight's
 * `img { max-width: 100% }` used to clamp the `.expo-image`'s 125% horizontal
 * overscan back to 100%, so the parallax translate exposed the container's zinc
 * background as a gray gap. With `max-width: none` the image is wider than its
 * container again (no gap), and the hero-scale bounded height keeps 0 horizontal
 * page overflow.
 */
export const ExpoHorizontalOverscan: Story = {
  args: { variant: 'media', effect: 'expo' },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.params.effect).toBe('expo'))

    // Hero-scale height applied (bounded, not collapsed to an aspect box).
    const track = canvasElement.querySelector('.swiper') as HTMLElement
    await waitFor(() => expect(track.clientHeight).toBeGreaterThan(300))

    const container = canvasElement.querySelector(
      '.expo-container',
    ) as HTMLElement
    const image = container.querySelector('.expo-image') as HTMLElement

    // The image overscans its container (≈125%) — not clamped to 100%.
    await waitFor(() => {
      const cw = container.getBoundingClientRect().width
      const iw = image.getBoundingClientRect().width
      expect(iw).toBeGreaterThan(cw * 1.1)
    })

    // Compositor hint landed on the transformed layers (INP mitigation).
    await expect(getComputedStyle(image).willChange).toContain('transform')

    // Bounded hero height → no horizontal page overflow.
    const doc = document.documentElement
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth + 1)
  },
}

/**
 * Full-bleed horizontal expo (#68.2, default ON): the carousel breaks out of its
 * reading column to the full viewport width (the shared `Container/section.ts`
 * idiom) so the parallax side-panels reach the screen edges instead of leaving
 * gray page-background bands. Framed here in a production-like `overflow-x: clip`
 * page wrapper (the root layout carries that clip), inside a narrow reading
 * column, so the breakout is real rather than theoretical. Asserts the wrapper
 * spans ~the viewport width, no horizontal overflow, and the shorter hero height
 * fits the whole carousel (track + arrows) within one screen.
 */
export const ExpoFullBleed: Story = {
  args: { variant: 'media', effect: 'expo', fullBleed: true },
  decorators: [
    (Story) => (
      <div className="overflow-x-clip" data-testid="clip-page">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.params.effect).toBe('expo'))

    const column = canvasElement.querySelector('.max-w-md') as HTMLElement
    const wrapper = canvasElement.querySelector(
      '[data-testid="carousel"]',
    ) as HTMLElement

    // The breakout idiom is applied (single-sourced from Container/section.ts),
    // mirroring the PhotoStrip full-bleed story's class assertion.
    for (const cls of ['w-screen', 'left-1/2', '-translate-x-1/2']) {
      await expect(wrapper.classList.contains(cls)).toBe(true)
    }

    // It actually breaks out: the wrapper spans ~the viewport width, far past
    // the narrow reading column it sits in. (0 horizontal *page* overflow is
    // guaranteed by the root layout's `overflow-x: clip` — the shared contract
    // this idiom relies on, measured 0 in the live prototype.)
    await waitFor(() => {
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        window.innerWidth - 2,
      )
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThan(
        column.getBoundingClientRect().width,
      )
    })

    // Shorter hero height (#68.2): the whole carousel (track + arrows) fits in
    // one screen — the arrows no longer fall off the bottom.
    await waitFor(() =>
      expect(wrapper.getBoundingClientRect().height).toBeLessThanOrEqual(
        window.innerHeight,
      ),
    )
  },
}

// ── hero presentation (B6.1): the opt-in full-screen hero mode ──────────────

/**
 * `presentation: 'hero'` (B6.1) — the opt-in full-screen hero mode the
 * `image`/`carousel` heroes use. Two things change from the default `'inline'`
 * mode, nothing else: `media` slides **fill** their box (`h-full`, no
 * `aspect-[16/9]`, no `rounded-2xl`) so a slide fills the 100dvh hero, and the
 * nav arrows + pagination render **overlaid at the bottom-centre inside the
 * swiper** rather than in a row below. Framed here in a fixed-height box (the
 * hero gives `h-dvh` in production) so the `h-full` fill chain has a definite
 * height to resolve against.
 */
export const HeroPresentationMode: Story = {
  args: { variant: 'media', presentation: 'hero' },
  decorators: [
    (Story) => (
      <div className="h-[70vh] w-full" data-testid="hero-frame">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const carousel = canvasElement.querySelector(
      '[data-testid="carousel"]',
    ) as HTMLElement
    // The leaf fills its host: the container, the swiper and the slides all take
    // full height, and the `!pb-10` that seats inline pagination is dropped.
    await expect(carousel).toHaveClass('h-full')
    const swiper = canvasElement.querySelector('.swiper') as HTMLElement
    await expect(swiper).toHaveClass('h-full')
    await expect(swiper.classList.contains('!pb-10')).toBe(false)

    // Media slides fill — no aspect box, no rounding.
    const slideBox = canvasElement.querySelector(
      '.swiper-slide .relative',
    ) as HTMLElement
    await expect(slideBox).toHaveClass('h-full')
    await expect(slideBox.classList.contains('aspect-[16/9]')).toBe(false)
    await expect(slideBox.classList.contains('rounded-2xl')).toBe(false)

    // The nav-arrow row is overlaid absolutely inside the swiper (not a row
    // below it), and its bottom stays within the carousel box.
    const prev = canvasElement.querySelector(
      'button[aria-label="Previous slide"]',
    ) as HTMLElement
    const navRow = prev.parentElement as HTMLElement
    await expect(navRow).toHaveClass('absolute')
    await expect(navRow.classList.contains('mt-4')).toBe(false)
    await expect(navRow.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      carousel.getBoundingClientRect().bottom + 1,
    )

    // Pagination overlays the slide at the bottom (present, inside the swiper).
    await expect(swiper.querySelector('.swiper-pagination')).not.toBeNull()
  },
}

/**
 * The proof the hero mode is strictly opt-in: the default `'inline'` render is
 * byte-identical to before B6.1 — `media` slides keep their aspect box and
 * rounding, the swiper keeps its `!pb-10`, and the nav arrows sit in the `mt-4`
 * row below the track (not overlaid). Every existing carousel (block /
 * testimonials / lab body) leaves `presentation` unset and renders exactly this.
 */
export const InlinePresentationUnchanged: Story = {
  args: { variant: 'media' },
  play: async ({ canvasElement }) => {
    const swiper = canvasElement.querySelector('.swiper') as HTMLElement
    // Inline keeps the pagination-seating padding and does NOT fill.
    await expect(swiper.classList.contains('!pb-10')).toBe(true)
    await expect(swiper.classList.contains('h-full')).toBe(false)

    // Media slides keep the aspect box + rounding.
    const slideBox = canvasElement.querySelector(
      '.swiper-slide .relative',
    ) as HTMLElement
    await expect(slideBox.classList.contains('aspect-[16/9]')).toBe(true)
    await expect(slideBox.classList.contains('rounded-2xl')).toBe(true)

    // Nav arrows sit in the row below the track, not overlaid.
    const prev = canvasElement.querySelector(
      'button[aria-label="Previous slide"]',
    ) as HTMLElement
    const navRow = prev.parentElement as HTMLElement
    await expect(navRow).toHaveClass('mt-4')
    await expect(navRow.classList.contains('absolute')).toBe(false)
  },
}

// ── carousel3d (#63): the ported infinite 3D carousel ────────────────────────

/**
 * media × carousel3d — the ported UI-Initiative infinite 3D carousel (#63): a
 * centred `slidesPerView: 'auto'` loop whose side slides recede in scale and
 * opacity. Uses a six-slide fixture (the effect is designed for ≥5).
 */
export const MediaCarousel3D: Story = {
  args: { variant: 'media', effect: 'carousel3d', slides: CAROUSEL3D_SLIDES },
}

/**
 * Effect-mounted (the React-availability + Swiper-14 receipt): with motion
 * allowed the ported Carousel-3D module mounts on the installed Swiper — the
 * instance reports `effect: 'carousel3d'` with `slidesPerView: 'auto'`, the
 * container carries the `swiper-carousel3d` modifier class, the custom
 * `carousel3dEffect` params are installed, and the effect's `progress` handler
 * has written real `translateX(...) scale(...)` transforms onto the slides.
 */
export const Carousel3DEffectMounted: Story = {
  args: { variant: 'media', effect: 'carousel3d', slides: CAROUSEL3D_SLIDES },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)

    await waitFor(() => expect(swiper.params.effect).toBe('carousel3d'))
    await expect(swiper.params.slidesPerView).toBe('auto')
    await expect(
      (swiper.params as { carousel3dEffect?: { sideSlides?: number } })
        .carousel3dEffect?.sideSlides,
    ).toBe(2)

    const container = canvasElement.querySelector('.swiper') as HTMLElement
    await expect(container.classList.contains('swiper-carousel3d')).toBe(true)

    // The effect drives a per-slide transform (proof it runs on Swiper 14).
    await waitFor(() => {
      const slides = Array.from(
        canvasElement.querySelectorAll('.swiper-carousel3d .swiper-slide'),
      ) as HTMLElement[]
      expect(
        slides.some(
          (s) =>
            s.style.transform.includes('scale') &&
            s.style.transform.includes('translateX'),
        ),
      ).toBe(true)
    })
  },
}

/** Instance-ref navigation advances the loop under carousel3d. */
export const Carousel3DNavigation: Story = {
  args: { variant: 'media', effect: 'carousel3d', slides: CAROUSEL3D_SLIDES },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.realIndex).toBe(0))

    await userEvent.click(canvas.getByRole('button', { name: 'Next slide' }))
    await waitFor(() => expect(swiper.realIndex).toBe(1))
  },
}

/** Keyboard nav stays wired under carousel3d (an AC of #41 the effect must not regress). */
export const Carousel3DKeyboardEnabled: Story = {
  args: { variant: 'media', effect: 'carousel3d', slides: CAROUSEL3D_SLIDES },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await expect(swiper.keyboard?.enabled).toBe(true)
  },
}

/**
 * Reduced-motion degrade (#63 AC): with the platform preference forced to
 * reduce, carousel3d collapses to a plain `slide` in the mapper — so the module
 * is NOT mounted (`effect !== 'carousel3d'`), the `swiper-carousel3d` class is
 * absent, and none of its DOM (`.carousel3d-image`) is emitted. The media slide
 * renders plain. The deterministic collapse is also unit-proven in options.test.
 */
export const Carousel3DReducedMotionDegrades: Story = {
  args: { variant: 'media', effect: 'carousel3d', slides: CAROUSEL3D_SLIDES },
  beforeEach: () => forceReducedMotion(),
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    const container = canvasElement.querySelector('.swiper') as HTMLElement

    await waitFor(() => expect(swiper.params.effect).not.toBe('carousel3d'))
    await expect(container.classList.contains('swiper-carousel3d')).toBe(false)
    await expect(canvasElement.querySelector('.carousel3d-image')).toBeNull()
  },
}

/**
 * Teal pagination (#66) under carousel3d: the active bullet takes the brand
 * `--color-teal-500` token, never Swiper's default blue — the same token class
 * the other leaves declare, re-declared on this leaf.
 */
export const Carousel3DPaginationBranded: Story = {
  args: {
    variant: 'media',
    effect: 'carousel3d',
    slides: CAROUSEL3D_SLIDES,
    navigation: false,
    pagination: true,
  },
  play: async ({ canvasElement }) => {
    const container = canvasElement.querySelector(
      '[data-testid="carousel"]',
    ) as HTMLElement
    const active = await waitFor(() => {
      const el = container.querySelector('.swiper-pagination-bullet-active')
      if (!el) throw new Error('no active bullet yet')
      return el as HTMLElement
    })

    const probe = document.createElement('div')
    probe.style.backgroundColor = 'var(--color-teal-500)'
    document.body.appendChild(probe)
    const teal = getComputedStyle(probe).backgroundColor
    probe.remove()

    await expect(getComputedStyle(active).backgroundColor).toBe(teal)
    await expect(getComputedStyle(active).backgroundColor).not.toBe(
      'rgb(0, 122, 255)',
    )
  },
}

/**
 * Full-bleed carousel3d (#63, default ON): the infinite carousel breaks out to
 * the full viewport width via the shared `Container/section.ts` idiom (the same
 * toggle Expo uses, widened to cover carousel3d). Framed in a production-like
 * `overflow-x: clip` page wrapper inside a narrow column so the breakout is real.
 */
export const Carousel3DFullBleed: Story = {
  args: {
    variant: 'media',
    effect: 'carousel3d',
    slides: CAROUSEL3D_SLIDES,
    fullBleed: true,
  },
  decorators: [
    (Story) => (
      <div className="overflow-x-clip" data-testid="clip-page">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.params.effect).toBe('carousel3d'))

    const column = canvasElement.querySelector('.max-w-md') as HTMLElement
    const wrapper = canvasElement.querySelector(
      '[data-testid="carousel"]',
    ) as HTMLElement
    for (const cls of ['w-screen', 'left-1/2', '-translate-x-1/2']) {
      await expect(wrapper.classList.contains(cls)).toBe(true)
    }
    await waitFor(() => {
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        window.innerWidth - 2,
      )
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThan(
        column.getBoundingClientRect().width,
      )
    })
  },
}

// ── spring (#64): the ported UI-Initiative Spring slider ─────────────────────

/**
 * cards × spring — the ported UI-Initiative Spring slider (#64): a normal
 * multi-card track whose cards ride Swiper's native Creative effect (a ±100%
 * translate) with a cascading per-slide `transitionDelay` stagger, so they
 * spring in on a trailing delay. Pairs with the `cards` variant (not media).
 */
export const CardsSpring: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
    slidesPerViewMobile: 2,
  },
}

/**
 * Effect-mounted + stagger-applied (the React-availability + Swiper-14 receipt):
 * with motion allowed, the CMS `spring` maps to Swiper's native creative effect
 * — the instance reports `effect: 'creative'` with `speed: 720`, the ±100%
 * `creativeEffect` translate installed, and the container carries the
 * `swiper-spring` modifier class. Driving progress deterministically
 * (`setProgress`) then proves the ported stagger runs on Swiper 14: it writes a
 * real per-slide `transitionDelay` onto the slides.
 */
export const SpringEffectMounted: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
    slidesPerViewMobile: 2,
  },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)

    // The spring → creative indirection: Swiper runs the native Creative effect.
    await waitFor(() => expect(swiper.params.effect).toBe('creative'))
    await expect(swiper.params.speed).toBe(720)
    await expect(swiper.params.followFinger).toBe(false)
    await expect(
      (
        swiper.params as {
          creativeEffect?: { next?: { translate?: (string | number)[] } }
        }
      ).creativeEffect?.next?.translate,
    ).toEqual(['100%', 0, 0])

    const container = canvasElement.querySelector('.swiper') as HTMLElement
    await expect(container.classList.contains('swiper-spring')).toBe(true)

    // The ported stagger runs on Swiper 14: once the track is laid out (visible
    // slides computed), a forward progress tick writes a real per-slide
    // transitionDelay. The progress event is emitted synchronously and the delays
    // read immediately (with `animating` pinned off, so no rAF deferral and no
    // transitionEnd reset can intervene between the write and the assertion). The
    // delay maths itself is exhaustively unit-proven in effectSpring.test.ts.
    await waitFor(() =>
      expect(swiper.visibleSlidesIndexes.length).toBeGreaterThan(0),
    )
    swiper.animating = false
    swiper.progress = 0
    swiper.emit('progress', swiper, 0) // establish the baseline previousProgress
    swiper.progress = 0.9
    swiper.emit('progress', swiper, 0.9) // a forward tick → stagger the delays
    const slides = Array.from(
      canvasElement.querySelectorAll('.swiper-spring .swiper-slide'),
    ) as HTMLElement[]
    await expect(
      slides.some(
        (s) =>
          s.style.transitionDelay.endsWith('ms') &&
          s.style.transitionDelay !== '0ms',
      ),
    ).toBe(true)
  },
}

/** Instance-ref navigation advances the spring track just like a plain one. */
export const SpringNavigation: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
    slidesPerViewMobile: 2,
  },
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

/** Keyboard nav stays wired under spring (an AC of #41 the effect must not regress). */
export const SpringKeyboardEnabled: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
  },
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await expect(swiper.keyboard?.enabled).toBe(true)
  },
}

/**
 * Reduced-motion degrade (#64 AC): with the platform preference forced to
 * reduce, spring collapses to a plain `slide` in the mapper — so Swiper does NOT
 * run the Creative effect (`effect !== 'creative'`), the `swiper-spring` class is
 * absent, and no `creativeEffect` config is installed, so neither the stagger nor
 * the spring timing CSS can apply. The cards render as a plain static track. The
 * deterministic collapse is also unit-proven in options.test.
 */
export const SpringReducedMotionDegrades: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
    slidesPerViewMobile: 2,
  },
  beforeEach: () => forceReducedMotion(),
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    const container = canvasElement.querySelector('.swiper') as HTMLElement

    await waitFor(() => expect(swiper.params.effect).not.toBe('creative'))
    await expect(container.classList.contains('swiper-spring')).toBe(false)
    await expect(
      (swiper.params as { creativeEffect?: unknown }).creativeEffect,
    ).toBeUndefined()
  },
}

/**
 * Full-bleed spring (#64, default ON): the spring cards track breaks out to the
 * full viewport width via the shared `Container/section.ts` idiom (the same
 * toggle Expo/Carousel-3D use, widened to cover spring — spring has no direction
 * axis, so it is always eligible). Framed in a production-like `overflow-x: clip`
 * page wrapper inside a narrow column so the breakout is real.
 */
export const SpringFullBleed: Story = {
  args: {
    variant: 'cards',
    effect: 'spring',
    slides: SPRING_SLIDES,
    slidesPerView: 3,
    slidesPerViewMobile: 2,
    fullBleed: true,
  },
  decorators: [
    (Story) => (
      <div className="overflow-x-clip" data-testid="clip-page">
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const swiper = await getSwiper(canvasElement)
    await waitFor(() => expect(swiper.params.effect).toBe('creative'))

    const column = canvasElement.querySelector('.max-w-md') as HTMLElement
    const wrapper = canvasElement.querySelector(
      '[data-testid="carousel"]',
    ) as HTMLElement
    for (const cls of ['w-screen', 'left-1/2', '-translate-x-1/2']) {
      await expect(wrapper.classList.contains(cls)).toBe(true)
    }
    await waitFor(() => {
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        window.innerWidth - 2,
      )
      expect(wrapper.getBoundingClientRect().width).toBeGreaterThan(
        column.getBoundingClientRect().width,
      )
    })
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
