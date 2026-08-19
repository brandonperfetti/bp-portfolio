import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { ResolvedSocialLink } from '@/blocks/SocialLinks/platforms'
import { HeroView } from '@/heros/HeroView'
import {
  HERO_HEADLINE_CLASS,
  HERO_SOCIAL_ROW_SPACING_CLASS,
  HERO_SUBTITLE_CLASS,
} from '@/heros/content'
import {
  HERO_CARD_FRAME_CLASS,
  HERO_CARD_SHELL_CLASS,
  HERO_FULL_BLEED_FRAME_CLASS,
  HERO_FULL_BLEED_HOME_FRAME_CLASS,
  HERO_MEDIA_FULL_BLEED_CLASS,
  HERO_MEDIA_TEXT_SHADOW_CLASS,
} from '@/heros/presentation'
import type { Page } from '@/payload-types'

vi.mock('next/image', () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...props} />,
}))
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// The canvas is loaded through next/dynamic and never SSRs; jsdom has no
// WebGPU either, so the static-gradient fallback is what renders here.
vi.mock('next/dynamic', () => ({ default: () => () => null }))
// GSAP wrapper (registers ScrollTrigger at import, which needs matchMedia):
// render children straight through so the opt-in `revealContent` wrapping is
// transparent here — the stories assert the reveal is real in a browser.
vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: { children: React.ReactNode }) => (
    <div data-scroll-reveal>{children}</div>
  ),
}))
// GSAP needs matchMedia (absent in jsdom); render the heading directly, but
// keep the variant observable — choosing it is what #38 added.
vi.mock('@/components/motion/AnimatedHeadline', () => ({
  AnimatedHeadline: ({
    text,
    variant,
    className,
  }: {
    text: string
    variant?: string
    className?: string
  }) => (
    <h1 data-variant={variant} className={className}>
      {text}
    </h1>
  ),
}))

// The carousel leaf is a Swiper client component with its own suite; here it
// is a probe that records the props HeroView hands it, so the hero test asserts
// the reuse contract (variant, effect, fixed knobs, resolved slides) without
// mounting Swiper.
vi.mock('@/blocks/Carousel/CarouselClient', () => ({
  CarouselClient: (props: Record<string, unknown>) => (
    <div
      data-testid="carousel-client"
      data-variant={String(props.variant)}
      data-effect={String(props.effect)}
      data-full-bleed={String(props.fullBleed)}
      data-autoplay={String(props.autoplay)}
      data-navigation={String(props.navigation)}
      data-pagination={String(props.pagination)}
      data-slide-count={String((props.slides as unknown[])?.length)}
    />
  ),
}))

// jsdom ships no matchMedia; ShaderHero's reduced-motion hook calls it.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
  // jsdom has no canvas backend either; answer the WebGL2 probe with a plain
  // "no GPU" instead of letting jsdom log "Not implemented" per render.
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    writable: true,
    value: () => null,
  })
})

const page = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 1,
    title: 'Consulting',
    subtitle: 'How I can help',
    slug: 'consulting',
    hero: { type: 'none', ...hero },
  }) as unknown as Page

/** Identity `sameAs`, already resolved — what `RenderHero` hands the view. */
const socialLinks: ResolvedSocialLink[] = [
  {
    href: 'https://x.com/brandonperfetti',
    label: 'Follow on X',
    platform: 'x',
  },
  {
    href: 'https://github.com/brandonperfetti',
    label: 'Follow on GitHub',
    platform: 'github',
  },
]

/** The decorative canvas frame, whatever presentation drew it. */
const canvas = (container: HTMLElement) =>
  container.querySelector('header > [aria-hidden="true"]')

const scrim = (container: HTMLElement) =>
  container.querySelector('.bg-gradient-to-r')
const bottomFade = (container: HTMLElement) => container.querySelector('.h-24')

/** The imported `socialLinks` icon row, if the hero drew one. */
const socialRow = (container: HTMLElement) =>
  container.querySelector('header section')

/**
 * The hero text column. Queried by class rather than by position because in
 * the full-bleed presentation the canvas frame is the header's first child.
 */
const contentStack = (container: HTMLElement) =>
  container.querySelector('.max-w-2xl') as HTMLElement

const headline = () => screen.getByRole('heading', { name: 'Consulting' })

describe('HeroView — type none', () => {
  it('renders the headline and subtitle with no canvas', () => {
    const { container } = render(<HeroView page={page({ type: 'none' })} />)

    expect(headline()).toBeVisible()
    expect(screen.getByText('How I can help')).toBeVisible()
    expect(canvas(container)).toBeNull()
    expect(container.querySelector('header')).toHaveClass('relative')
    expect(container.querySelector('header')).not.toHaveClass('isolate')
  })

  // The condition matrix in `config.ts` leaves headlineVariant and
  // showSocialLinks unconditional because `none` still renders the content
  // stack. If that ever stops being true, this is the test that says so.
  it('still renders the content stack, which is why the content fields are ungated', () => {
    render(
      <HeroView
        page={page({ type: 'none', headlineVariant: 'typewriter' })}
        socialLinks={socialLinks}
      />,
    )

    expect(headline()).toHaveAttribute('data-variant', 'typewriter')
    expect(screen.getByRole('link', { name: 'Follow on X' })).toBeVisible()
  })
})

describe('HeroView — type blank', () => {
  // `blank` is the one type that renders nothing at all — no <header>, no
  // headline — so an about-style page can carry its H1 in a body `heading`
  // block without the hero drawing a second one. The content fields are gated
  // off `blank` in config precisely because this renders none of them.
  it('renders no header and no headline', () => {
    const { container } = render(<HeroView page={page({ type: 'blank' })} />)

    expect(container).toBeEmptyDOMElement()
    expect(container.querySelector('header')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Consulting' })).toBeNull()
  })

  it('renders nothing even when content fields happen to be stored', () => {
    // A page switched to `blank` after carrying hero content: the stored
    // values are inert, not resurrected.
    const { container } = render(
      <HeroView
        page={page({
          type: 'blank',
          headlineVariant: 'typewriter',
          showSocialLinks: true,
        })}
        socialLinks={socialLinks}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('link', { name: 'Follow on X' })).toBeNull()
  })
})

describe('HeroView — type standard', () => {
  it('renders the hero media below the text and no canvas', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'standard',
          media: {
            id: 2,
            url: '/media/office.jpg',
            alt: 'Office',
            width: 1200,
            height: 800,
          },
        } as Partial<NonNullable<Page['hero']>>)}
      />,
    )

    expect(screen.getByRole('img', { name: 'Office' })).toBeVisible()
    expect(canvas(container)).toBeNull()
  })

  it('ignores a shaderPreset it happens to carry', () => {
    const { container } = render(
      <HeroView
        page={page({ type: 'standard', shaderPreset: 'synthesis-14' })}
      />,
    )

    expect(canvas(container)).toBeNull()
  })
})

describe('HeroView — type image', () => {
  const imagePage = () =>
    page({
      type: 'image',
      media: {
        id: 3,
        url: '/media/banner.jpg',
        alt: 'A wide banner',
        width: 1600,
        height: 900,
      },
    } as Partial<NonNullable<Page['hero']>>)

  it('renders the media full-bleed behind the overlaid content, with a scrim', () => {
    const { container } = render(<HeroView page={imagePage()} />)

    // The banner sits in the shared full-bleed frame (default rhythm), as a
    // decoration layer behind the content — aria-hidden like the shader canvas,
    // with the meaning carried by the overlaid title/subtitle text.
    const frame = canvas(container)
    expect(frame).toHaveAttribute('class', HERO_FULL_BLEED_FRAME_CLASS)
    expect(frame?.querySelector('img')).toHaveAttribute(
      'src',
      '/media/banner.jpg',
    )
    // Legibility scrim (both themes covered by its dark: stops).
    expect(scrim(container)).not.toBeNull()
    expect(bottomFade(container)).not.toBeNull()
  })

  it('overlays the content stack with a legibility text-shadow', () => {
    const { container } = render(<HeroView page={imagePage()} />)

    expect(headline()).toBeVisible()
    expect(contentStack(container)).toHaveClass(HERO_MEDIA_TEXT_SHADOW_CLASS)
  })

  it('follows the route rhythm for its full-bleed frame, like the shader hero', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'image',
          rhythm: 'homeParity',
          media: { id: 3, url: '/media/banner.jpg', alt: 'A wide banner' },
        } as Partial<NonNullable<Page['hero']>>)}
      />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_HOME_FRAME_CLASS,
    )
  })

  it('renders the content stack even when no media is stored', () => {
    const { container } = render(<HeroView page={page({ type: 'image' })} />)

    expect(headline()).toBeVisible()
    expect(canvas(container)).toBeNull()
  })
})

describe('HeroView — type carousel', () => {
  const heroSlides = [
    { id: 'a', src: '/media/1.jpg', alt: 'One' },
    { id: 'b', src: '/media/2.jpg', alt: 'Two' },
  ]

  const carouselClient = () => screen.queryByTestId('carousel-client')

  it('mounts the reused CarouselClient with the fixed hero knobs', () => {
    render(
      <HeroView
        page={page({ type: 'carousel', effect: 'expo' })}
        heroSlides={heroSlides}
      />,
    )

    const leaf = carouselClient()
    expect(leaf).not.toBeNull()
    // The reuse contract: media variant, hero-owned frame (fullBleed off so the
    // leaf's effect-gated breakout is never applied twice), autoplay off,
    // nav/pagination on, the editor's effect passed through, resolved slides.
    expect(leaf).toHaveAttribute('data-variant', 'media')
    expect(leaf).toHaveAttribute('data-full-bleed', 'false')
    expect(leaf).toHaveAttribute('data-autoplay', 'false')
    expect(leaf).toHaveAttribute('data-navigation', 'true')
    expect(leaf).toHaveAttribute('data-pagination', 'true')
    expect(leaf).toHaveAttribute('data-effect', 'expo')
    expect(leaf).toHaveAttribute('data-slide-count', '2')
  })

  it('owns the full-bleed frame and overlays content that never blocks the carousel', () => {
    const { container } = render(
      <HeroView page={page({ type: 'carousel' })} heroSlides={heroSlides} />,
    )

    // The hero owns the horizontal breakout (the leaf gets fullBleed=false).
    expect(container.querySelector('header')).toHaveAttribute(
      'class',
      HERO_MEDIA_FULL_BLEED_CLASS,
    )
    // Overlaid content is pointer-events-none so drag/arrows/keyboard reach the
    // carousel beneath it; the scrim likewise never intercepts.
    const overlay = contentStack(container).parentElement as HTMLElement
    expect(overlay).toHaveClass('pointer-events-none')
    expect(scrim(container)).toHaveClass('pointer-events-none')
    expect(contentStack(container)).toHaveClass(HERO_MEDIA_TEXT_SHADOW_CLASS)
    expect(headline()).toBeVisible()
  })

  it('falls back to the bare content stack when no slides resolve', () => {
    const { container } = render(
      <HeroView page={page({ type: 'carousel' })} heroSlides={[]} />,
    )

    expect(carouselClient()).toBeNull()
    expect(headline()).toBeVisible()
    expect(container.querySelector('header')).toHaveClass('relative')
    expect(container.querySelector('header')).not.toHaveClass('w-screen')
  })

  it('passes no effect through untouched (the leaf defaults it)', () => {
    render(
      <HeroView page={page({ type: 'carousel' })} heroSlides={heroSlides} />,
    )

    // Unset effect reaches the leaf as undefined; the leaf's mapper defaults it.
    expect(carouselClient()).toHaveAttribute('data-effect', 'undefined')
  })

  it('re-enables pointer events on the CTA + social wrappers, not the headline', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'carousel',
          links: [
            {
              id: 'a',
              link: { type: 'custom', url: '/contact', label: 'Get in touch' },
            },
          ],
        } as unknown as Partial<NonNullable<Page['hero']>>)}
        socialLinks={socialLinks}
        heroSlides={heroSlides}
      />,
    )

    // The overlay stays pointer-events-none, so a drag on empty overlay area
    // still reaches the carousel beneath.
    const overlay = contentStack(container).parentElement as HTMLElement
    expect(overlay).toHaveClass('pointer-events-none')

    // The two interactive wrappers opt back in so they stay clickable.
    const cta = screen.getByRole('link', { name: 'Get in touch' })
      .parentElement as HTMLElement
    expect(cta).toHaveClass('pointer-events-auto')
    const row = container.querySelector('header section') as HTMLElement
    expect(row.parentElement).toHaveClass('pointer-events-auto')

    // The headline and the content column stay non-interactive — no opt-in, so
    // a drag starting on the title still reaches the carousel.
    expect(headline()).not.toHaveClass('pointer-events-auto')
    expect(contentStack(container)).not.toHaveClass('pointer-events-auto')
  })
})

describe('HeroView — type shader, presentation fullBleed', () => {
  it('escapes the route container, keeps scrim and bottom fade', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
    expect(scrim(container)).not.toBeNull()
    expect(bottomFade(container)).not.toBeNull()
  })

  // Regression, staging QA 2026-08-12: the header used to carry `isolate`,
  // which trapped the -z-10 canvas in the header's own stacking context. The
  // header then painted as one atomic unit above every following in-flow
  // block, and a socialLinks container at y≈348 vanished behind the canvas.
  // The isolation belongs on the route wrapper that holds hero *and* blocks
  // (HERO_FULL_BLEED_ROUTE_ISOLATION_CLASS); the header must only position.
  it('positions the header without isolating it', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )
    const header = container.querySelector('header')

    expect(header).toHaveClass('relative')
    expect(header).not.toHaveClass('isolate')
    expect(header).toHaveAttribute('class', 'relative')
  })

  // The hero content stack must stay in normal flow for the same reason: an
  // extra stacking context or positioned wrapper around it would re-create
  // the occlusion the route's isolation exists to prevent.
  it('leaves the content stack in normal flow, unpositioned and un-isolated', () => {
    const { container } = render(
      <HeroView
        page={page({ type: 'shader', presentation: 'fullBleed' })}
        socialLinks={socialLinks}
      />,
    )
    const stack = contentStack(container)

    expect(stack).toHaveAttribute('class', 'max-w-2xl')
    expect(stack.parentElement).toHaveAttribute('class', 'relative')
    expect(socialRow(container)).not.toHaveClass('isolate')
  })

  it('keeps the canvas in the negative layer so page content paints over it', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(canvas(container)).toHaveClass('-z-10')
  })

  it('is what a page written before the field existed renders as', () => {
    const { container } = render(<HeroView page={page({ type: 'shader' })} />)

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })

  it('renders the hero text above the canvas, not inside a card', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(headline()).toBeVisible()
    expect(container.querySelector('header')).not.toHaveClass('rounded-2xl')
  })
})

describe('HeroView — full-bleed canvas frame follows the route rhythm (#42)', () => {
  it('uses the standard frame when the page sets no rhythm — byte-identical to before the field', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })

  it('uses the standard frame when the page opts into the standard rhythm', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'fullBleed',
          rhythm: 'standard',
        })}
      />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })

  it('uses the home-parity frame when the page opts into that rhythm', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'fullBleed',
          rhythm: 'homeParity',
        })}
      />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_HOME_FRAME_CLASS,
    )
  })

  it('falls back to the standard frame for a rhythm this build does not know', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'fullBleed',
          rhythm: 'flush',
        } as unknown as Partial<NonNullable<Page['hero']>>)}
      />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })
})

describe('HeroView — type shader, presentation card', () => {
  it('renders a bounded rounded panel with the canvas inside it', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(container.querySelector('header')).toHaveAttribute(
      'class',
      HERO_CARD_SHELL_CLASS,
    )
    expect(canvas(container)).toHaveAttribute('class', HERO_CARD_FRAME_CLASS)
  })

  it('drops the scrim and the page fade — a card has no page to blend into', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(scrim(container)).toBeNull()
    expect(bottomFade(container)).toBeNull()
  })

  it('puts the hero text on the canvas with a legibility shadow', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(headline()).toBeVisible()
    expect(container.querySelector('[class*="text-shadow"]')).not.toBeNull()
  })

  it('falls back to full bleed for an unknown stored presentation', () => {
    // A value the current vocabulary doesn't know — what a row written by a
    // later (or rolled-back) schema looks like to this renderer.
    const { container } = render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'billboard',
        } as unknown as Partial<NonNullable<Page['hero']>>)}
      />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })
})

describe('HeroView — headline variant (#38)', () => {
  it('animates line by line when nothing is stored — the pre-#38 behaviour', () => {
    render(<HeroView page={page({ type: 'standard' })} />)

    expect(headline()).toHaveAttribute('data-variant', 'line')
  })

  it('animates as a typewriter when the editor picks it', () => {
    render(
      <HeroView
        page={page({ type: 'shader', headlineVariant: 'typewriter' })}
      />,
    )

    expect(headline()).toHaveAttribute('data-variant', 'typewriter')
  })

  it('reaches the card presentation too, not just the flow ones', () => {
    render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'card',
          headlineVariant: 'typewriter',
        })}
      />,
    )

    expect(headline()).toHaveAttribute('data-variant', 'typewriter')
  })

  it('falls back to line for a value this build does not know', () => {
    render(
      <HeroView
        page={
          page({
            type: 'standard',
            headlineVariant: 'scramble',
          } as unknown as Partial<NonNullable<Page['hero']>>) as Page
        }
      />,
    )

    expect(headline()).toHaveAttribute('data-variant', 'line')
  })

  it('keeps the homepage headline and subtitle classes', () => {
    render(<HeroView page={page({ type: 'standard' })} />)

    expect(headline()).toHaveAttribute('class', HERO_HEADLINE_CLASS)
    expect(screen.getByText('How I can help')).toHaveAttribute(
      'class',
      HERO_SUBTITLE_CLASS,
    )
  })
})

describe('HeroView — social icon row (#38)', () => {
  it('draws no row when the hero has no resolved links', () => {
    const { container } = render(
      <HeroView page={page({ type: 'shader', showSocialLinks: true })} />,
    )

    expect(socialRow(container)).toBeNull()
  })

  it('renders the Identity links as the socialLinks block’s icon row', () => {
    const { container } = render(
      <HeroView
        page={page({ type: 'shader', showSocialLinks: true })}
        socialLinks={socialLinks}
      />,
    )

    expect(screen.getByRole('link', { name: 'Follow on X' })).toHaveAttribute(
      'href',
      'https://x.com/brandonperfetti',
    )
    expect(screen.getByRole('link', { name: 'Follow on GitHub' })).toBeVisible()
    // The block's own icon-row markup, imported not rebuilt.
    expect(socialRow(container)?.firstElementChild).toHaveClass(
      'flex',
      'flex-wrap',
      'gap-6',
    )
  })

  it('spaces the row at the homepage’s mt-6 and drops the block’s my-12', () => {
    const { container } = render(
      <HeroView
        page={page({ type: 'shader', showSocialLinks: true })}
        socialLinks={socialLinks}
      />,
    )
    const row = socialRow(container) as HTMLElement

    // The homepage's `mt-6` gap, plus the `pointer-events-auto` that keeps the
    // row clickable when this stack is overlaid on the carousel hero (a no-op
    // in this shader context, where the ancestor already accepts events).
    expect(row.parentElement).toHaveAttribute(
      'class',
      `${HERO_SOCIAL_ROW_SPACING_CLASS} pointer-events-auto`,
    )
    // `my-12` is a *block's* page rhythm; a hero owns its own stack spacing.
    expect(row).not.toHaveClass('my-12')
  })

  it('renders the row last, after the hero’s own links', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'standard',
          links: [
            {
              id: 'a',
              link: { type: 'custom', url: '/contact', label: 'Get in touch' },
            },
          ],
        } as unknown as Partial<NonNullable<Page['hero']>>)}
        socialLinks={socialLinks}
      />,
    )
    expect(contentStack(container).lastElementChild).toBe(
      socialRow(container)?.parentElement,
    )
  })

  it('reaches the card presentation too', () => {
    const { container } = render(
      <HeroView
        page={page({
          type: 'shader',
          presentation: 'card',
          showSocialLinks: true,
        })}
        socialLinks={socialLinks}
      />,
    )

    expect(socialRow(container)).not.toBeNull()
  })
})
