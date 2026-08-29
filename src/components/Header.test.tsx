import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Header } from '@/components/Header'

// #76 Piece 1: `Header` now wraps its `usePathname`-reading body (`HeaderInner`)
// in a Suspense boundary so dynamic-param route shells can prerender. These
// tests assert the split is behavior-preserving — the nav renders and the active
// link is highlighted from the current pathname.
let mockPathname = '/about'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: () => {} }),
}))

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img {...props} />
  ),
}))
/* eslint-enable @next/next/no-img-element */

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

vi.mock('@/components/search/CommandPalette', () => ({
  CommandPalette: () => <div data-testid="command-palette" />,
}))

vi.mock('@/components/auth/HeaderUserButton', () => ({
  HeaderUserButton: () => <div data-testid="user-button" />,
}))

const navigationItems = [
  { href: '/about', label: 'About' },
  { href: '/articles', label: 'Articles' },
]

afterEach(() => {
  mockPathname = '/about'
  vi.clearAllMocks()
})

describe('Header', () => {
  it('renders the injected navigation items (through the Suspense boundary)', () => {
    render(<Header navigationItems={navigationItems} />)

    // Desktop + mobile nav each render the labels; at least one must exist.
    expect(
      screen.getAllByRole('link', { name: 'About' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('link', { name: 'Articles' }).length,
    ).toBeGreaterThan(0)
  })

  it('highlights the active nav link from the current pathname', () => {
    mockPathname = '/articles'
    render(<Header navigationItems={navigationItems} />)

    const desktopArticles = screen
      .getAllByRole('link', { name: 'Articles' })
      .find((el) => el.className.includes('text-teal-700'))
    expect(desktopArticles).toBeTruthy()
  })

  it('mounts the account chip only when showUserButton is set', () => {
    const { rerender } = render(
      <Header navigationItems={navigationItems} showUserButton={false} />,
    )
    expect(screen.queryByTestId('user-button')).not.toBeInTheDocument()

    rerender(<Header navigationItems={navigationItems} showUserButton={true} />)
    expect(screen.getByTestId('user-button')).toBeInTheDocument()
  })
})
