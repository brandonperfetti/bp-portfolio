import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/Button'

/**
 * Contrast pin for the legacy v3 primary button (#82 / PR #123 carry).
 *
 * @remarks This file exists for one reason: the primary variant's hover fill
 * is an accessibility decision, and nothing else in the tree records it. The
 * fill went `teal-700 → teal-600` on hover, i.e. it got LIGHTER, which took
 * white-on-teal from 5.36:1 down to 3.67:1 — under the 4.5:1 WCAG AA floor for
 * this button's 14px text — for exactly as long as a pointer rested on the
 * site's primary CTA. Hover is now teal-800 (7.54:1), the higher-contrast
 * state of the two.
 *
 * Ratios are computed from the OKLCH tokens Tailwind 4.3.3 actually resolves
 * (`node_modules/tailwindcss/theme.css`: teal-600 `oklch(60% 0.118 184.704)`
 * → `#009689`, teal-700 `oklch(51.1% 0.096 186.391)` → `#00786f`, teal-800
 * `oklch(43.7% 0.078 188.216)` → `#005f5a`), converted to sRGB and run through
 * the WCAG relative-luminance formula — not from the v3 hex approximations
 * that still sit in the `--corvus-*` custom properties.
 *
 * Asserting a class string is a blunt instrument, and it is the right one
 * here: jsdom has no `:hover`, computes no Tailwind, and cannot be asked what
 * the rendered contrast is. The class IS the artifact under test. The `teal`
 * variant in `src/components/ui/button.tsx` carries the same rule and the same
 * reasoning in its own comment; if this ever needs to move, move both together
 * and redo the arithmetic rather than deleting the pin.
 *
 * `docs/STYLING.md` calls this component "port-remnant and slated for
 * removal". Until that day it renders the site's primary CTA, so it is held to
 * the same floor as its replacement.
 */
describe('Button — primary variant contrast', () => {
  it('darkens on hover in both themes instead of lightening below AA', () => {
    render(<Button>Go</Button>)
    const className = screen.getByRole('button', { name: 'Go' }).className

    // The regression, stated as the thing that must never come back.
    expect(className).not.toMatch(/(?:^|\s|:)hover:bg-teal-600(?:\s|$)/)
    expect(className).not.toContain('dark:hover:bg-teal-600')

    // teal-800 on white is 7.54:1; the resting teal-700 fill is 5.36:1.
    expect(className).toContain('hover:bg-teal-800')
    expect(className).toContain('dark:hover:bg-teal-800')
    expect(className).toContain('bg-teal-700')
    expect(className).toContain('dark:bg-teal-700')
  })

  it('leaves the secondary variant alone', () => {
    // Guard against a broad find-and-replace: secondary is zinc-on-zinc and
    // was never part of this finding.
    render(<Button variant="secondary">Later</Button>)
    const className = screen.getByRole('button', { name: 'Later' }).className

    expect(className).toContain('hover:bg-zinc-100')
    expect(className).not.toContain('teal')
  })

  it('applies the same fill to the link form', () => {
    // The component renders an <a> when `href` is present, sharing one
    // className expression — so the anchor inherits the fix rather than
    // needing its own. Pinned because the two branches are easy to fork.
    render(<Button href="/contact">Contact</Button>)

    expect(screen.getByRole('link', { name: 'Contact' }).className).toContain(
      'hover:bg-teal-800',
    )
  })
})
