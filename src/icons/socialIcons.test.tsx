import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  SOCIAL_PLATFORM_ICONS,
  type SocialPlatform,
} from '@/blocks/SocialLinks/platforms'

/**
 * A smoke test over every glyph the social resolver can pick (#46).
 *
 * @remarks These icons carry no behaviour, so the risk they run is a silent
 * one: a mistyped `d`, a missing `aria-hidden`, or a hard-coded brand `fill`
 * that would ignore the `fill-*` utility the row applies and so break
 * light/dark parity. None of that shows up in a resolver unit test, and a
 * story only exercises the handful of platforms its fixtures happen to use —
 * whereas this walks the icon map itself, so a platform added later without
 * a usable icon fails here.
 */
describe('social platform icons', () => {
  const platforms = Object.keys(SOCIAL_PLATFORM_ICONS) as SocialPlatform[]

  it.each(platforms)('renders a decorative in-box svg for %s', (platform) => {
    const Icon = SOCIAL_PLATFORM_ICONS[platform]
    const { container } = render(<Icon className="h-6 w-6 fill-zinc-500" />)
    const svg = container.querySelector('svg')

    expect(svg).not.toBeNull()
    // Decorative: the link's accessible name comes from its `aria-label` or
    // its visible text, never from the glyph.
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    // The caller's classes must survive the prop spread — the row styles the
    // glyph entirely from the outside.
    expect(svg).toHaveClass('h-6', 'w-6', 'fill-zinc-500')
    expect(svg?.querySelectorAll('path, circle, rect').length).toBeGreaterThan(
      0,
    )
  })

  it.each(platforms)('carries no literal colour for %s', (platform) => {
    const Icon = SOCIAL_PLATFORM_ICONS[platform]
    const { container } = render(<Icon className="fill-zinc-500" />)
    const svg = container.querySelector('svg')

    // A baked-in colour would pin the glyph to one theme. Every icon here
    // gets its colour from a utility class or `currentColor` instead, which
    // is what light/dark parity rests on.
    expect(svg?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(svg?.outerHTML).not.toMatch(/\b(rgb|hsl)a?\(/i)
  })

  /**
   * The brand marks specifically. `email` and `link` are excluded on
   * purpose: `MailIcon` is a two-tone outline drawing that sets its own
   * `fill="none"` and colours its strokes per theme, and `LinkIcon` paints
   * with `currentColor` — both predate #46 and neither is a brand mark.
   */
  const brandGlyphs = platforms.filter(
    (platform) => platform !== 'email' && platform !== 'link',
  )

  it.each(brandGlyphs)('inherits the row fill for %s', (platform) => {
    const Icon = SOCIAL_PLATFORM_ICONS[platform]
    const { container } = render(<Icon className="fill-zinc-500" />)
    const svg = container.querySelector('svg')

    // No `fill` on the element and none on its shapes, so the caller's
    // `fill-*` utility — including its `dark:` and `group-hover:` variants —
    // is what actually paints the mark.
    expect(svg?.getAttribute('fill')).toBeNull()
    for (const shape of svg?.querySelectorAll('path') ?? []) {
      expect(shape.getAttribute('fill')).toBeNull()
    }
  })
})
