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
