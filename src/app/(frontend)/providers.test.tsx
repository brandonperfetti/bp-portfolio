import { useContext } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { AppContext, Providers } from '@/app/(frontend)/providers'

// ThemeWatcher (inside Providers) reads window.matchMedia in an effect; jsdom
// has no implementation, so stub a no-op media query list.
beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
})

// #76 Piece 1: `usePathname` moved out of `Providers` (which wraps the whole
// app) into an isolated, Suspense-bounded `PreviousPathnameTracker`, so the app
// subtree never sits inside the pathname Suspense boundary. These tests assert
// the AppContext `previousPathname` behavior is preserved and that children
// render (and are not gated by the tracker).
let mockPathname = '/a'
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useTheme: () => ({ resolvedTheme: 'light', setTheme: () => {} }),
}))

vi.mock('@/components/consent/ConsentManager', () => ({
  ConsentManager: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))

function PreviousPathnameProbe() {
  const { previousPathname } = useContext(AppContext)
  return <div data-testid="prev">{previousPathname ?? 'none'}</div>
}

afterEach(() => {
  mockPathname = '/a'
  vi.clearAllMocks()
})

describe('Providers', () => {
  it('renders children (never gated by the isolated pathname tracker)', () => {
    render(
      <Providers>
        <div data-testid="child">hello</div>
      </Providers>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('hello')
  })

  it('starts with no previousPathname on first load', () => {
    render(
      <Providers>
        <PreviousPathnameProbe />
      </Providers>,
    )
    expect(screen.getByTestId('prev')).toHaveTextContent('none')
  })

  it('reports the prior pathname after an in-app navigation', async () => {
    const { rerender } = render(
      <Providers>
        <PreviousPathnameProbe />
      </Providers>,
    )

    mockPathname = '/b'
    rerender(
      <Providers>
        <PreviousPathnameProbe />
      </Providers>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('prev')).toHaveTextContent('/a'),
    )
  })
})
