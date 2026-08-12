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
  }: {
    page: Page
    socialLinks?: ResolvedSocialLink[]
  }) => (
    <div data-testid="hero-view" data-title={page.title}>
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
