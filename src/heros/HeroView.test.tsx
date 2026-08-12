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

    expect(row.parentElement).toHaveAttribute(
      'class',
      HERO_SOCIAL_ROW_SPACING_CLASS,
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
