import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { WorkHistoryCardBlock } from '@/payload-types'

// The résumé branch reads the Payload Local API through `getCmsWorkHistory`;
// this suite is about which branch the block takes and how the per-entry one
// flattens its row, so the list is stubbed to a recognizable marker.
vi.mock('@/components/home/Resume', () => ({
  Resume: () => <div data-testid="resume-card" />,
}))

const { WorkHistoryCardComponent, workHistoryEntryFacts } =
  await import('@/blocks/WorkHistoryCard/Component')

/** A populated `work-history` relationship, as Payload returns it at depth ≥ 1. */
const entry = (
  overrides: Record<string, unknown> = {},
): NonNullable<WorkHistoryCardBlock['entry']> =>
  ({
    id: 1,
    company: 'Brytecore',
    title: 'Senior Frontend Engineer',
    slug: 'brytecore',
    startDate: '2024-09-02T12:00:00.000Z',
    endDate: null,
    current: true,
    description: 'Front-end platform work.',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as NonNullable<WorkHistoryCardBlock['entry']>

describe('WorkHistoryCardComponent · mode selection (#137)', () => {
  it('renders the résumé card when no entry is picked — the pre-#137 shape', () => {
    render(<WorkHistoryCardComponent />)

    expect(screen.getByTestId('resume-card')).toBeInTheDocument()
    expect(screen.queryByText('Brytecore')).not.toBeInTheDocument()
  })

  it('renders one role’s facts when an entry is picked', () => {
    render(<WorkHistoryCardComponent entry={entry()} />)

    expect(screen.queryByTestId('resume-card')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Brytecore' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument()
    expect(screen.getByText('Front-end platform work.')).toBeInTheDocument()
  })

  /**
   * A relationship whose target was deleted comes back `null`, and one read at
   * depth 0 comes back as a bare id. Neither may render an empty bordered box
   * where a résumé used to be.
   */
  it('falls back to the résumé card for a deleted or unpopulated entry', () => {
    const { rerender } = render(<WorkHistoryCardComponent entry={null} />)
    expect(screen.getByTestId('resume-card')).toBeInTheDocument()

    rerender(<WorkHistoryCardComponent entry={7} />)
    expect(screen.getByTestId('resume-card')).toBeInTheDocument()
  })

  it('honours showDescription only in per-entry mode', () => {
    render(<WorkHistoryCardComponent entry={entry()} showDescription={false} />)

    expect(
      screen.queryByText('Front-end platform work.'),
    ).not.toBeInTheDocument()
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument()
  })

  it('still renders the card chrome in per-entry mode', () => {
    render(
      <WorkHistoryCardComponent entry={entry()} heading="Where I’ve worked" />,
    )

    expect(
      screen.getByRole('heading', { level: 2, name: 'Where I’ve worked' }),
    ).toBeInTheDocument()
    // The chrome heading owns the h2, so the company steps down to h3.
    expect(
      screen.getByRole('heading', { level: 3, name: 'Brytecore' }),
    ).toBeInTheDocument()
  })
})

/**
 * The rendered half of the #188 matrix. `hostContext.test.ts` pins what the
 * helper returns; this pins that the block asks it the right question — which
 * is the half that was wrong, since the helper's answer for a root-hosted card
 * was never in dispute.
 */
describe('WorkHistoryCardComponent · width by mode (#188, #137)', () => {
  const sectionOf = (ui: React.ReactElement) => {
    const { container } = render(ui)
    const section = container.querySelector('section')
    if (!section) throw new Error('the block rendered no <section>')
    return section
  }

  it('widens the per-entry card to the content measure at root', () => {
    // The defect: on `/work/<slug>` this card sits above full-measure prose,
    // and `max-w-xl` capped it well under the paragraph beneath it.
    const section = sectionOf(<WorkHistoryCardComponent entry={entry()} />)
    expect(section).toHaveClass('max-w-none')
    expect(section).not.toHaveClass('max-w-xl')
    // The root rhythm is untouched by the widening.
    expect(section).toHaveClass('my-12')
  })

  it('keeps the résumé list on its reading measure at root', () => {
    const section = sectionOf(<WorkHistoryCardComponent />)
    expect(section).toHaveClass('max-w-xl')
    expect(section).not.toHaveClass('max-w-none')
  })

  it('fills the column in BOTH modes when the editor picked the width', () => {
    expect(
      sectionOf(<WorkHistoryCardComponent entry={entry()} hosted="column" />),
    ).toHaveClass('max-w-none')
    expect(sectionOf(<WorkHistoryCardComponent hosted="column" />)).toHaveClass(
      'max-w-none',
    )
  })

  it('reads the measure off the same fallback the render branch takes', () => {
    // An entry whose row was deleted comes back `null` and renders the résumé
    // card, so it must take the résumé card's width too — not the width the
    // unset `entry` field implied.
    const section = sectionOf(<WorkHistoryCardComponent entry={7} />)
    expect(screen.getByTestId('resume-card')).toBeInTheDocument()
    expect(section).toHaveClass('max-w-xl')
  })
})

describe('workHistoryEntryFacts', () => {
  it('reads a current role as an open-ended period, never as this year', () => {
    expect(workHistoryEntryFacts(entry())).toMatchObject({
      startYear: '2024',
      endYear: null,
    })
  })

  it('treats a missing end date as still held, exactly as the résumé card does', () => {
    expect(
      workHistoryEntryFacts(entry({ current: false, endDate: null })),
    ).toMatchObject({ endYear: null })
  })

  it('reads a closed role’s end year in UTC', () => {
    expect(
      workHistoryEntryFacts(
        entry({ current: false, endDate: '2020-12-31T12:00:00.000Z' }),
      ),
    ).toMatchObject({ startYear: '2024', endYear: '2020' })
  })

  it('drops an unparseable date rather than rendering Invalid Date', () => {
    expect(
      workHistoryEntryFacts(entry({ startDate: 'not-a-date' })),
    ).toMatchObject({ startYear: null })
  })

  it('answers null for an unset or id-only relationship', () => {
    expect(workHistoryEntryFacts(null)).toBeNull()
    expect(workHistoryEntryFacts(undefined as never)).toBeNull()
    expect(workHistoryEntryFacts(7)).toBeNull()
  })
})
