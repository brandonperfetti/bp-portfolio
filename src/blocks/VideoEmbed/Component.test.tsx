import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { VideoEmbedComponent } from '@/blocks/VideoEmbed/Component'

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

/**
 * The fallback link is a `text-link-accent` site like every other link in
 * the site chrome, and those carry the SAME hover pair in both themes
 * (`hover:text-teal-600 dark:hover:text-teal-300` — `CMSLink`,
 * `ArticlesArchiveView`, `ArticlesExplorer`, `CookieBanner`, `CookieDialog`;
 * `src/styles/tailwind.css` lists the six). Without the `dark:`
 * half, the unqualified light hover overrides the dark resting teal-400 with
 * teal-600 — darker on a dark backdrop, the direction `docs/STYLING.md`
 * forbids (CodeRabbit on #235, `Component.tsx:54`).
 */
describe('VideoEmbedComponent fallback link', () => {
  it('keeps light/dark hover parity with the other link-accent sites', () => {
    render(
      <VideoEmbedComponent
        blockType="videoEmbed"
        url="https://example.com/a-talk"
        title="A talk that is not on YouTube or Vimeo"
      />,
    )

    const link = screen.getByRole('link', {
      name: 'A talk that is not on YouTube or Vimeo',
    })
    expect(link).toHaveAttribute('href', 'https://example.com/a-talk')
    expect(link).toHaveClass('text-link-accent')
    expect(link).toHaveClass('hover:text-teal-600')
    expect(link).toHaveClass('dark:hover:text-teal-300')
  })
})
