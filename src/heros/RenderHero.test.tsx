import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { RenderHero } from '@/heros/RenderHero'
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
// GSAP needs matchMedia (absent in jsdom); render the heading directly.
vi.mock('@/components/motion/AnimatedHeadline', () => ({
  AnimatedHeadline: ({ text }: { text: string }) => <h1>{text}</h1>,
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

/** The decorative canvas frame, whatever presentation drew it. */
const canvas = (container: HTMLElement) =>
  container.querySelector('header > [aria-hidden="true"]')

const scrim = (container: HTMLElement) =>
  container.querySelector('.bg-gradient-to-r')
const bottomFade = (container: HTMLElement) => container.querySelector('.h-24')

describe('RenderHero — type none', () => {
  it('renders the headline and subtitle with no canvas', () => {
    const { container } = render(<RenderHero page={page({ type: 'none' })} />)

    expect(screen.getByRole('heading', { name: 'Consulting' })).toBeVisible()
    expect(screen.getByText('How I can help')).toBeVisible()
    expect(canvas(container)).toBeNull()
    expect(container.querySelector('header')).toHaveClass('relative')
    expect(container.querySelector('header')).not.toHaveClass('isolate')
  })
})

describe('RenderHero — type standard', () => {
  it('renders the hero media below the text and no canvas', () => {
    const { container } = render(
      <RenderHero
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
      <RenderHero
        page={page({ type: 'standard', shaderPreset: 'synthesis-14' })}
      />,
    )

    expect(canvas(container)).toBeNull()
  })
})

describe('RenderHero — type shader, presentation fullBleed', () => {
  it('escapes the route container, keeps scrim and bottom fade', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
    expect(scrim(container)).not.toBeNull()
    expect(bottomFade(container)).not.toBeNull()
  })

  it('isolates the header so the -z-10 canvas stays above the page panel', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(container.querySelector('header')).toHaveClass('relative', 'isolate')
  })

  it('is what a page written before the field existed renders as', () => {
    const { container } = render(<RenderHero page={page({ type: 'shader' })} />)

    expect(canvas(container)).toHaveAttribute(
      'class',
      HERO_FULL_BLEED_FRAME_CLASS,
    )
  })

  it('renders the hero text above the canvas, not inside a card', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'fullBleed' })} />,
    )

    expect(screen.getByRole('heading', { name: 'Consulting' })).toBeVisible()
    expect(container.querySelector('header')).not.toHaveClass('rounded-2xl')
  })
})

describe('RenderHero — type shader, presentation card', () => {
  it('renders a bounded rounded panel with the canvas inside it', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(container.querySelector('header')).toHaveAttribute(
      'class',
      HERO_CARD_SHELL_CLASS,
    )
    expect(canvas(container)).toHaveAttribute('class', HERO_CARD_FRAME_CLASS)
  })

  it('drops the scrim and the page fade — a card has no page to blend into', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(scrim(container)).toBeNull()
    expect(bottomFade(container)).toBeNull()
  })

  it('puts the hero text on the canvas with a legibility shadow', () => {
    const { container } = render(
      <RenderHero page={page({ type: 'shader', presentation: 'card' })} />,
    )

    expect(screen.getByRole('heading', { name: 'Consulting' })).toBeVisible()
    expect(container.querySelector('[class*="text-shadow"]')).not.toBeNull()
  })

  it('falls back to full bleed for an unknown stored presentation', () => {
    // A value the current vocabulary doesn't know — what a row written by a
    // later (or rolled-back) schema looks like to this renderer.
    const { container } = render(
      <RenderHero
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
