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
 * the site chrome, and those carry the SAME hover token
 * (`hover:text-link-accent-hover` — `CMSLink`, `ArticlesArchiveView`,
 * `ArticlesExplorer`, `CookieBanner`, `CookieDialog`; #231). The token
 * inverts on `.dark` for you, so the class is one and parity holds by
 * construction. Before #231 this site carried a literal light-only
 * `hover:text-teal-600`, which overrode the dark resting teal-400 with a
 * darker step on a dark backdrop (CodeRabbit on #235, `Component.tsx:54`);
 * the assertion that no literal `hover:text-teal-*` survives is what keeps
 * that from coming back.
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
    expect(link).toHaveClass('hover:text-link-accent-hover')
    expect(link.className).not.toMatch(/hover:text-teal-\d+/)
  })
})
