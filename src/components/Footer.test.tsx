import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FooterWithNavigation } from '@/components/Footer'

// #76 Piece 1: `FooterWithNavigation` now wraps its `usePathname`-reading body
// (`FooterInner`) in a Suspense boundary so dynamic-param route shells can
// prerender. These tests assert the split is behavior-preserving: the footer
// renders its nav on normal routes and stays hidden on /corvus.
let mockPathname = '/about'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
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

vi.mock('@/components/consent/ManageCookiesLink', () => ({
  ManageCookiesLink: () => <button type="button">Manage cookies</button>,
}))

const navigationItems = [
  { href: '/about', label: 'About' },
  { href: '/articles', label: 'Articles' },
]

afterEach(() => {
  mockPathname = '/about'
  vi.clearAllMocks()
})

describe('FooterWithNavigation', () => {
  it('renders the nav items, consent entry point, and agent links off /corvus', () => {
    mockPathname = '/about'
    render(<FooterWithNavigation navigationItems={navigationItems} />)

    expect(screen.getByRole('link', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Articles' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /manage cookies/i }),
    ).toBeInTheDocument()
    // Machine-readable resources row.
    expect(screen.getByRole('link', { name: 'llms.txt' })).toHaveAttribute(
      'href',
      '/llms.txt',
    )
    expect(
      screen.getByText(/Brandon Perfetti\. All rights/),
    ).toBeInTheDocument()
  })

  it('renders exactly the same markup with no footer links as with the prop left out (#363)', () => {
    const without = render(
      <FooterWithNavigation navigationItems={navigationItems} />,
    )
    const withoutHtml = without.container.innerHTML
    without.unmount()

    const empty = render(
      <FooterWithNavigation
        navigationItems={navigationItems}
        footerLinks={[]}
      />,
    )

    expect(empty.container.innerHTML).toBe(withoutHtml)
  })

  it('renders the CMS footer links after the nav items and before the consent entry point (#363)', () => {
    render(
      <FooterWithNavigation
        navigationItems={navigationItems}
        footerLinks={[
          { href: '/privacy', label: 'Privacy' },
          { href: 'https://example.test/elsewhere', label: 'Elsewhere' },
        ]}
      />,
    )

    const row = screen.getByRole('link', { name: 'About' }).parentElement!
    expect(Array.from(row.children).map((child) => child.textContent)).toEqual([
      'About',
      'Articles',
      'Privacy',
      'Elsewhere',
      'Manage cookies',
    ])
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/privacy',
    )
    // An off-site link opens the way every other external link here does.
    const external = screen.getByRole('link', { name: 'Elsewhere' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external.getAttribute('rel')).toContain('noopener')
  })

  it('does not repeat a footer link that points where a nav item already does', () => {
    render(
      <FooterWithNavigation
        navigationItems={navigationItems}
        footerLinks={[
          { href: '/about', label: 'About me' },
          { href: '/privacy', label: 'Privacy' },
          { href: '/privacy', label: 'Privacy again' },
        ]}
      />,
    )

    // The navigation item is the one that stays.
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute(
      'href',
      '/about',
    )
    expect(
      screen.queryByRole('link', { name: 'About me' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacy' })).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: 'Privacy again' }),
    ).not.toBeInTheDocument()
  })

  it('renders nothing on the /corvus chat surface, footer links included', () => {
    mockPathname = '/corvus'
    const { container } = render(
      <FooterWithNavigation
        navigationItems={navigationItems}
        footerLinks={[{ href: '/privacy', label: 'Privacy' }]}
      />,
    )

    expect(container.querySelector('footer')).toBeNull()
    expect(
      screen.queryByRole('link', { name: 'Privacy' }),
    ).not.toBeInTheDocument()
  })

  it('renders nothing on the /corvus chat surface', () => {
    mockPathname = '/corvus'
    const { container } = render(
      <FooterWithNavigation navigationItems={navigationItems} />,
    )

    expect(container.querySelector('footer')).toBeNull()
    expect(
      screen.queryByRole('link', { name: 'About' }),
    ).not.toBeInTheDocument()
  })
})
