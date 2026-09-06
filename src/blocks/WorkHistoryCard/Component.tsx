import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import {
  type BlockHostContext,
  blockRhythmClass,
  zeroConfigCardWidthClass,
} from '@/blocks/hostContext'
import {
  WorkHistoryEntry,
  type WorkHistoryEntryFacts,
} from '@/blocks/WorkHistoryCard/WorkHistoryEntry'
import { Resume } from '@/components/home/Resume'
import { mediaUrl } from '@/lib/cms/mediaUrl'
import { cn } from '@/lib/utils'
import type { WorkHistoryCardBlock } from '@/payload-types'

/** Four-digit UTC year, or `null` for a missing or unparseable date. */
const toYearLabel = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.getUTCFullYear().toString()
}

/**
 * Flatten a populated `work-history` row to the plain facts the view renders.
 *
 * @param entry - The block's `entry` relationship value.
 * @returns The flattened facts, or `null` when the relationship is unset or
 * came back as a bare id (depth 0) rather than a populated document.
 *
 * @remarks Mirrors `workHistoryRepo`'s "current, or no end date, means still
 * held" rule so the résumé card and a role page can never disagree about
 * whether Brandon still works somewhere — but resolves it to a `null`
 * `endYear` rather than the current year, because the view must not read
 * `Date.now()` during prerender (#76 B2). See {@link WorkHistoryEntryFacts}.
 */
export const workHistoryEntryFacts = (
  entry: WorkHistoryCardBlock['entry'],
): WorkHistoryEntryFacts | null => {
  if (!entry || typeof entry !== 'object') return null
  const stillHeld = Boolean(entry.current) || !entry.endDate
  return {
    company: entry.company ?? '',
    title: entry.title ?? '',
    startYear: toYearLabel(entry.startDate),
    endYear: stillHeld ? null : toYearLabel(entry.endDate),
    logoUrl: mediaUrl(entry.logo),
    description: entry.description ?? null,
  }
}

/**
 * Work-history section (CMS page builder). Server component.
 *
 * Two modes, chosen by the `entry` relationship (#137):
 *
 * - **`entry` unset** — the home Work card backed by the whole `work-history`
 *   collection, under an optional heading + intro. Byte for byte the section
 *   this block rendered before #137, because every stored block reads `entry`
 *   back as `null`.
 * - **`entry` set** — that one role's structured facts, which is what a
 *   `/work/<slug>` page is composed from. The row is populated by Payload at
 *   read depth, so no extra query is issued here.
 *
 * @param props - The stored block (`heading` / `intro`, #40; `entry` and
 * `showDescription`, #137), plus `hosted`: where the block is rendering. At
 * root it keeps its reading measure; inside a column it fills the width the
 * editor picked, rather than leaving the right half of a full-width column
 * empty.
 *
 * @remarks A relationship pointing at a deleted row comes back `null`, which
 * falls through to the résumé card rather than rendering an empty box — the
 * same degradation the block had before it could name a single role. Deciding
 * that here (not in the view) keeps the view a pure function of its facts and
 * therefore drivable from Storybook, which may not reach the Local API.
 */
export function WorkHistoryCardComponent({
  heading,
  intro,
  entry,
  showDescription,
  hosted,
}: Partial<WorkHistoryCardBlock> & { hosted?: BlockHostContext }) {
  const facts = workHistoryEntryFacts(entry ?? null)

  return (
    <section
      className={cn(blockRhythmClass(hosted), zeroConfigCardWidthClass(hosted))}
    >
      {facts ? (
        <WorkHistoryEntry
          facts={facts}
          heading={heading}
          intro={intro}
          showDescription={showDescription ?? true}
        />
      ) : (
        <>
          <CardChromeHeader heading={heading} intro={intro} />
          <Resume />
        </>
      )}
    </section>
  )
}
