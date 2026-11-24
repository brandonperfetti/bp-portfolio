import { render, screen } from '@testing-library/react'
import Link from 'next/link'
import { describe, expect, it } from 'vitest'

import { Button, buttonVariants } from './button'

/**
 * #431 review: the primitive animates every change (`transition-all`), so it
 * must also switch that off under `prefers-reduced-motion`
 * (docs/ACCESSIBILITY.md "Reduced motion"). Pinned at the primitive, because
 * every button on the site inherits it.
 */
describe('Button: reduced motion', () => {
  it.each(['default', 'outline', 'ghost', 'link'] as const)(
    'the %s variant drops its transition under reduced motion',
    (variant) => {
      const classes = buttonVariants({ variant }).split(/\s+/)
      expect(classes).toContain('transition-all')
      expect(classes).toContain('motion-reduce:transition-none')
    },
  )

  it('keeps the override when rendered as a child link (asChild)', () => {
    render(
      <Button asChild variant="outline">
        <Link href="/x">Go</Link>
      </Button>,
    )
    expect(screen.getByRole('link', { name: 'Go' }).className).toContain(
      'motion-reduce:transition-none',
    )
  })
})
