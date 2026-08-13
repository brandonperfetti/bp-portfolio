import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ArticleMeta } from '@/components/cms/ArticleMeta'

// Repo convention (see ArticlesArchive/Component.test.tsx): mock next/link to a
// plain anchor so assertions read the exact href the component passes. The real
// next/link normalizes internal hrefs to a trailing slash (`/about/`) in jsdom,
// which would mask the actual value under test — the byline routes to `/about`.
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

describe('ArticleMeta byline', () => {
  it('renders a rich guest byline: avatar, role, and social links', () => {
    render(
      <ArticleMeta
        author={{
          name: 'Ada Lovelace',
          role: 'Guest Author',
          image: 'https://img.example/ada.jpg',
          sameAs: ['https://github.com/ada', 'https://x.com/ada'],
        }}
      />,
    )

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Guest Author')).toBeInTheDocument()

    // Decorative avatar: hidden from a11y tree, present in the DOM.
    const avatar = document.querySelector('img')
    expect(avatar).toHaveAttribute('src', 'https://img.example/ada.jpg')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')

    const github = screen.getByRole('link', { name: 'GitHub' })
    expect(github).toHaveAttribute('href', 'https://github.com/ada')
    expect(github).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'X' })).toHaveAttribute(
      'href',
      'https://x.com/ada',
    )
  })

  it('links the site-owner byline to /about with no avatar or links', () => {
    render(
      <ArticleMeta
        author={{
          name: 'Brandon Perfetti',
          role: 'Technical PM + Software Engineer',
          href: '/about',
        }}
      />,
    )

    const link = screen.getByRole('link', { name: 'Brandon Perfetti' })
    expect(link).toHaveAttribute('href', '/about')
    // Internal link: no new-tab attributes.
    expect(link).not.toHaveAttribute('target')
    expect(document.querySelector('img')).toBeNull()
  })

  it('renders a plain string author as a name-only byline', () => {
    render(<ArticleMeta author="Brandon Perfetti" />)

    // The site-owner name still routes to /about via the owner heuristic.
    expect(
      screen.getByRole('link', { name: 'Brandon Perfetti' }),
    ).toHaveAttribute('href', '/about')
    expect(screen.queryByText('Guest Author')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })
})
