import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TechCard } from '@/components/tech/TechCard'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { TechSignalSummary } from '@/lib/tech/githubSignals'

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

vi.mock('@/components/motion/HoverMotionCard', () => ({
  HoverMotionCard: ({ children, as: As = 'div' }: any) => <As>{children}</As>,
}))

const item: CmsEntityItem = {
  slug: 'nextjs',
  name: 'Next.js',
  description: 'React framework.',
  category: 'Framework',
  proficiency: 'daily',
  link: { href: 'https://nextjs.org', label: 'nextjs.org' },
}

const signal: TechSignalSummary = {
  key: 'nextjs',
  score: 42,
  repoCount: 7,
  reasons: ['package', 'primary-language'],
  intensity: 1,
}

describe('TechCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders name, chips, and proficiency label', () => {
    render(
      <ul>
        <TechCard item={item} />
      </ul>,
    )
    expect(screen.getByText('Next.js')).toBeInTheDocument()
    expect(screen.getByText('Framework')).toBeInTheDocument()
    expect(screen.getByText('Daily driver')).toBeInTheDocument()
    // No signal → no activity disclosure.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows the activity badge and expands scan evidence on toggle', async () => {
    const user = userEvent.setup()
    render(
      <ul>
        <TechCard item={item} signal={signal} />
      </ul>,
    )

    expect(screen.getByText('7 repos')).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /GitHub activity/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByText(/Seen in 7 recently active repos/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/package manifests, primary language/i),
    ).toBeInTheDocument()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('pluralizes the badge correctly for a single repo', () => {
    render(
      <ul>
        <TechCard item={item} signal={{ ...signal, repoCount: 1 }} />
      </ul>,
    )
    expect(screen.getByText('1 repo')).toBeInTheDocument()
  })
})
