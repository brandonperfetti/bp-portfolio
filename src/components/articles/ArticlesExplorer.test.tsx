import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ArticlesExplorer } from '@/components/articles/ArticlesExplorer'
import type { ArticleWithSlug } from '@/lib/articles'

const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/articles',
  useSearchParams: () => new URLSearchParams(''),
}))

/* eslint-disable @next/next/no-img-element */
vi.mock('next/image', () => ({
  default: (props: any) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img {...props} />
  ),
}))
/* eslint-enable @next/next/no-img-element */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/motion/ScrollReveal', () => ({
  ScrollReveal: ({ children }: any) => <>{children}</>,
}))

vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ as: Tag = 'div', children }: any) => (
    <Tag>{children}</Tag>
  ),
}))

describe('ArticlesExplorer', () => {
  it('shows a distinct tech chip when topic and first tech value would otherwise duplicate', () => {
    const articles: ArticleWithSlug[] = [
      {
        slug: 'react-form-zod',
        title: "Building Form Validation You Don't Hate",
        description: 'React Hook Form + Zod walkthrough.',
        author: 'Brandon Perfetti',
        date: '2026-03-01',
        topics: ['react'],
        tech: ['react', 'zod'],
        searchText: 'react zod form validation',
      },
    ]

    render(<ArticlesExplorer articles={articles} />)

    const articleTitle = screen.getByText(
      "Building Form Validation You Don't Hate",
    )
    const articleCard = articleTitle.closest('article')
    expect(articleCard).not.toBeNull()
    if (!articleCard) {
      throw new Error('Expected article card to be present')
    }

    expect(within(articleCard).getByText('react')).toBeInTheDocument()
    expect(within(articleCard).getByText('zod')).toBeInTheDocument()
  })
})
