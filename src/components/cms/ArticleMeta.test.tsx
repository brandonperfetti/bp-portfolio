import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ArticleMeta } from '@/components/cms/ArticleMeta'

// Repo convention (see ArticlesArchive/Component.test.tsx): mock next/link to a
// plain anchor so assertions read the exact href the component passes. The real
// next/link normalizes internal hrefs to a trailing slash (`/about/`) in jsdom,
// which would mask the actual value under test — the byline routes to `/about`.
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

describe('ArticleMeta byline', () => {
  it('renders a rich guest byline: avatar, role, and social links', () => {
    render(
      <ArticleMeta
        author={{
          name: 'Ada Lovelace',
          role: 'Guest Author',
          image: 'https://img.example/ada.jpg',
          sameAs: ['https://github.com/ada', 'https://x.com/ada'],
        }}
      />,
    )

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Guest Author')).toBeInTheDocument()

    // Decorative avatar: hidden from a11y tree, present in the DOM.
    const avatar = document.querySelector('img')
    expect(avatar).toHaveAttribute('src', 'https://img.example/ada.jpg')
    expect(avatar).toHaveAttribute('aria-hidden', 'true')

    // Socials are icon links; the accessible name is the resolver's label.
    const github = screen.getByRole('link', { name: 'Follow on GitHub' })
    expect(github).toHaveAttribute('href', 'https://github.com/ada')
    expect(github).toHaveAttribute('target', '_blank')
    expect(github.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Follow on X' })).toHaveAttribute(
      'href',
      'https://x.com/ada',
    )
  })

  it('renders socials as icon links (shared icon set), unknown host → link fallback, no bullet separators', () => {
    render(
      <ArticleMeta
        author={{
          name: 'Ada Lovelace',
          sameAs: [
            'https://x.com/ada',
            'https://github.com/ada',
            'https://www.linkedin.com/in/ada/',
            'https://example.com/ada', // unknown host → generic link icon
          ],
        }}
      />,
    )

    // Known platforms resolve to their brand accessible name...
    expect(screen.getByRole('link', { name: 'Follow on X' })).toHaveAttribute(
      'href',
      'https://x.com/ada',
    )
    expect(
      screen.getByRole('link', { name: 'Follow on GitHub' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Follow on LinkedIn' }),
    ).toBeInTheDocument()
    // ...and an unknown host falls back to the generic link icon, labeled by
    // its hostname (the "all scenarios covered" case).
    expect(screen.getByRole('link', { name: 'example.com' })).toHaveAttribute(
      'href',
      'https://example.com/ada',
    )

    // Icons, not text: every social is an <svg> and there are no bullets.
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    items.forEach((li) => expect(li.querySelector('svg')).not.toBeNull())
    expect(screen.queryByText('•')).toBeNull()
  })

  it('links the site-owner byline to /about with no avatar or links', () => {
    render(
      <ArticleMeta
        author={{
          name: 'Brandon Perfetti',
          role: 'Technical PM + Software Engineer',
          href: '/about',
        }}
      />,
    )

    const link = screen.getByRole('link', { name: 'Brandon Perfetti' })
    expect(link).toHaveAttribute('href', '/about')
    // Internal link: no new-tab attributes.
    expect(link).not.toHaveAttribute('target')
    expect(document.querySelector('img')).toBeNull()
  })

  it('renders a plain string author as a name-only byline', () => {
    render(<ArticleMeta author="Brandon Perfetti" />)

    // The site-owner name still routes to /about via the owner heuristic.
    expect(
      screen.getByRole('link', { name: 'Brandon Perfetti' }),
    ).toHaveAttribute('href', '/about')
    expect(screen.queryByText('Guest Author')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
  })
})

/**
 * #151 — topic chips are destinations. The three ACs live here: a topic with a
 * published home links to it, one without links to the pre-filtered view, and
 * a topic whose home was unpublished or deleted arrives with no `sectionPath`
 * and therefore takes the same fallback rather than linking at a 404.
 */
describe('ArticleMeta topic chips (#151)', () => {
  it('links a topic with a section home at that page', () => {
    render(
      <ArticleMeta
        topics={['Leadership']}
        topicLinks={[{ title: 'Leadership', sectionPath: 'work/leadership' }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Leadership' })).toHaveAttribute(
      'href',
      '/work/leadership',
    )
  })

  it('links a topic without one at the pre-filtered /articles view', () => {
    render(
      <ArticleMeta
        topics={['Engineering']}
        topicLinks={[{ title: 'Engineering' }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Engineering' })).toHaveAttribute(
      'href',
      '/articles?topic=Engineering',
    )
  })

  it('falls back rather than 404s when the home is unpublished or deleted', () => {
    // `getTopicSectionPaths` leaves such a topic without a `sectionPath`; this
    // pins that the component treats that as the fallback, not as an error.
    render(
      <ArticleMeta
        topics={['Leadership']}
        topicLinks={[{ title: 'Leadership', sectionPath: undefined }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'Leadership' })).toHaveAttribute(
      'href',
      '/articles?topic=Leadership',
    )
  })

  it('renders plain spans when the caller has only titles', () => {
    // The pre-#151 shape: no `topicLinks`, so no anchors appear where there
    // were none before.
    render(<ArticleMeta topics={['Engineering']} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Engineering')).toBeInTheDocument()
  })

  it('keeps the dedupe, trim and cap-of-three the flat titles always had', () => {
    render(
      <ArticleMeta
        topics={['  Alpha ', 'Alpha', 'Beta', 'Gamma', 'Delta']}
        topicLinks={[
          { title: 'Alpha' },
          { title: 'Beta' },
          { title: 'Gamma' },
          { title: 'Delta' },
        ]}
      />,
    )

    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.queryByText('Delta')).not.toBeInTheDocument()
  })

  it('matches a chip to its href case-insensitively', () => {
    render(
      <ArticleMeta
        topics={['leadership']}
        topicLinks={[{ title: 'Leadership', sectionPath: 'work/leadership' }]}
      />,
    )

    expect(screen.getByRole('link', { name: 'leadership' })).toHaveAttribute(
      'href',
      '/work/leadership',
    )
  })

  it('never turns a tech chip into a link — only topics have homes', () => {
    render(
      <ArticleMeta
        topics={['Leadership']}
        topicLinks={[{ title: 'Leadership', sectionPath: 'work/leadership' }]}
        tech={['React']}
      />,
    )

    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByText('React').tagName).toBe('SPAN')
  })
})
