import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Resume } from '@/components/home/Resume'

// #76 Piece 1: the "Present" role's `dateTime` moved from a module-level
// `new Date().getFullYear()` (sync-IO, rejected by cacheComponents at prerender)
// into the request-time render of this async Server Component. These tests cover
// that render path — the fallback resume and the CMS-driven path.
const getCmsWorkHistory = vi.fn()
const getCmsIdentity = vi.fn()

vi.mock('@/lib/cms/workHistoryRepo', () => ({
  getCmsWorkHistory: (...args: unknown[]) => getCmsWorkHistory(...args),
}))
vi.mock('@/lib/cms/identityRepo', () => ({
  getCmsIdentity: (...args: unknown[]) => getCmsIdentity(...args),
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

beforeEach(() => {
  getCmsWorkHistory.mockReset()
  getCmsIdentity.mockReset()
  getCmsIdentity.mockResolvedValue({ resumeUrl: undefined })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Resume', () => {
  it('renders the fallback "Present" role with the current year as its dateTime', async () => {
    // Empty CMS → the hard-coded fallback resume, whose "Present" end date is
    // the current year computed at render (the sync-IO fix).
    getCmsWorkHistory.mockResolvedValue([])

    render(await Resume())

    const currentYear = new Date().getFullYear().toString()
    const present = screen.getByText('Present')
    expect(present.tagName).toBe('TIME')
    expect(present).toHaveAttribute('dateTime', currentYear)
  })

  it('renders CMS work-history entries when present, preserving their end date', async () => {
    getCmsWorkHistory.mockResolvedValue([
      {
        company: 'Acme',
        title: 'Engineer',
        logo: undefined,
        start: '2020',
        end: '2024',
      },
    ])

    render(await Resume())

    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
    // The fallback (with its current-year "Present") must not appear.
    expect(screen.queryByText('Present')).not.toBeInTheDocument()
  })

  it('prefers the CMS resume URL for the download button, else the static asset', async () => {
    getCmsWorkHistory.mockResolvedValue([])
    getCmsIdentity.mockResolvedValue({ resumeUrl: '/uploads/cv.pdf' })

    render(await Resume())

    expect(screen.getByRole('link', { name: /download cv/i })).toHaveAttribute(
      'href',
      '/uploads/cv.pdf',
    )
  })
})
