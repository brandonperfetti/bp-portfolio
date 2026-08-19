import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ResolvedSocialLink } from '@/blocks/SocialLinks/platforms'
import { RenderHero } from '@/heros/RenderHero'
import type { Page } from '@/payload-types'

const getCmsIdentity = vi.fn()
vi.mock('@/lib/cms/identityRepo', () => ({
  getCmsIdentity: () => getCmsIdentity(),
}))

// The view has its own suite (`HeroView.test.tsx`) covering every pixel; here
// it is a probe that reports what the server component resolved for it.
vi.mock('@/heros/HeroView', () => ({
  HeroView: ({
    page,
    socialLinks,
    heroSlides,
  }: {
    page: Page
    socialLinks?: ResolvedSocialLink[]
    heroSlides?: unknown[]
  }) => (
    <div
      data-testid="hero-view"
      data-title={page.title}
      data-slides={JSON.stringify(heroSlides)}
    >
      {JSON.stringify(socialLinks)}
    </div>
  ),
}))

const page = (hero: Partial<NonNullable<Page['hero']>> = {}) =>
  ({
    id: 1,
    title: 'Consulting',
    subtitle: 'How I can help',
    slug: 'consulting',
    hero: { type: 'shader', ...hero },
  }) as unknown as Page

/** Render an async server component the way React would await it. */
const renderHero = async (doc: Page) => render(await RenderHero({ page: doc }))

const resolved = () =>
  JSON.parse(screen.getByTestId('hero-view').textContent || 'null') as
    ResolvedSocialLink[] | null

const resolvedSlides = () =>
  JSON.parse(
    screen.getByTestId('hero-view').getAttribute('data-slides') || 'null',
  )

beforeEach(() => {
  getCmsIdentity.mockReset()
  getCmsIdentity.mockResolvedValue({
    name: 'Brandon Perfetti',
    sameAs: [
      'https://x.com/brandonperfetti',
      'https://github.com/brandonperfetti',
      'https://www.linkedin.com/in/brandonperfetti/',
    ],
  })
})

describe('RenderHero — Identity social links (#38)', () => {
  it('resolves the Identity sameAs list to icon-row links', async () => {
    await renderHero(page({ showSocialLinks: true }))

    expect(resolved()).toEqual([
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
      {
        href: 'https://www.linkedin.com/in/brandonperfetti/',
        label: 'Follow on LinkedIn',
        platform: 'linkedin',
      },
    ])
  })

  it('does not query Identity at all when the row is off', async () => {
    await renderHero(page({ showSocialLinks: false }))

    expect(getCmsIdentity).not.toHaveBeenCalled()
    expect(resolved()).toEqual([])
  })

  it('treats a page written before the field existed as row-off', async () => {
    await renderHero(page())

    expect(getCmsIdentity).not.toHaveBeenCalled()
    expect(resolved()).toEqual([])
  })

  // `getCmsIdentity` only filters falsy entries, so a whitespace-only row in
  // the global still reaches here.
  it('drops blank rows the global happens to carry', async () => {
    getCmsIdentity.mockResolvedValue({
      name: 'Brandon Perfetti',
      sameAs: ['   ', 'https://github.com/brandonperfetti'],
    })

    await renderHero(page({ showSocialLinks: true }))

    expect(resolved()).toEqual([
      {
        href: 'https://github.com/brandonperfetti',
        label: 'Follow on GitHub',
        platform: 'github',
      },
    ])
  })

  it('renders the hero even when Identity has no profiles', async () => {
    getCmsIdentity.mockResolvedValue({ name: 'Brandon Perfetti', sameAs: [] })

    await renderHero(page({ showSocialLinks: true }))

    expect(screen.getByTestId('hero-view')).toHaveAttribute(
      'data-title',
      'Consulting',
    )
    expect(resolved()).toEqual([])
  })
})

describe('RenderHero — carousel slide resolution (#65)', () => {
  const slide = (over: Record<string, unknown> = {}) => ({
    id: 'a',
    image: {
      id: 9,
      url: '/media/1.jpg',
      alt: 'One',
      width: 1600,
      height: 900,
    },
    title: 'One',
    text: 'First',
    href: '/one',
    ...over,
  })

  it('resolves each carousel slide upload to plain, serializable slide data', async () => {
    await renderHero(
      page({ type: 'carousel', slides: [slide()] } as unknown as Partial<
        NonNullable<Page['hero']>
      >),
    )

    expect(resolvedSlides()).toEqual([
      {
        id: 'a',
        src: '/media/1.jpg',
        alt: 'One',
        width: 1600,
        height: 900,
        title: 'One',
        text: 'First',
        href: '/one',
      },
    ])
  })

  it('drops a slide whose image has no resolvable URL (the media variant needs one)', async () => {
    await renderHero(
      page({
        type: 'carousel',
        slides: [
          slide({ id: 'a', image: 42 }), // unresolved relationship id, no object
          slide({ id: 'b' }),
        ],
      } as unknown as Partial<NonNullable<Page['hero']>>),
    )

    const slides = resolvedSlides() as { id: string }[]
    expect(slides).toHaveLength(1)
    expect(slides[0].id).toBe('b')
  })

  it('resolves no slides for a non-carousel hero', async () => {
    await renderHero(
      page({
        type: 'standard',
        slides: [slide()],
      } as unknown as Partial<NonNullable<Page['hero']>>),
    )

    expect(resolvedSlides()).toEqual([])
  })

  it('resolves an empty array for a carousel hero with no slides', async () => {
    await renderHero(page({ type: 'carousel' }))

    expect(resolvedSlides()).toEqual([])
  })
})
