import { CardChromeHeader } from '@/blocks/CardChromeHeader'
import { getOptimizedImageUrl } from '@/lib/image-utils'

/**
 * The four structured facts one `work-history` row contributes to a role page,
 * flattened to plain serializable values.
 *
 * @remarks Deliberately not `WorkHistory` from `payload-types`: the view is the
 * pixel-owning half of the block and is rendered by Storybook in the browser
 * project, where nothing may reach the Payload Local API. Flattening happens
 * once, in the server `Component`.
 */
export type WorkHistoryEntryFacts = {
  /** Employer name — the heading of the card. */
  company: string
  /** Role title held at that employer. */
  title: string
  /** Four-digit start year, or `null` when the row has no start date. */
  startYear: string | null
  /**
   * Four-digit end year, or `null` for a role still held — which renders the
   * literal word "Present" rather than the current year.
   *
   * @remarks Reading the current year here would be a `Date.now()` call inside
   * a prerendered server component, which `cacheComponents` rejects (#76 B2);
   * the résumé card solves the same problem with a client `CurrentYearTime`.
   * A role page needs no live year at all — "Present" says the same thing and
   * stays static.
   */
  endYear: string | null
  /** Absolute logo URL, or `null` when the row has no logo. */
  logoUrl?: string | null
  /** Optional narrative paragraph from the row's `description` textarea. */
  description?: string | null
}

/**
 * Format the period line: `2024 – Present`, `2013 – 2017`, or nothing at all
 * when the row carries no start year.
 */
const periodLabel = (startYear: string | null, endYear: string | null) =>
  startYear ? `${startYear} – ${endYear ?? 'Present'}` : null

/**
 * One role's facts, as rendered on a `/work/<slug>` page (#137).
 *
 * @param facts - The flattened row (see {@link WorkHistoryEntryFacts}).
 * @param heading - Optional card-chrome heading above the facts (#40).
 * @param intro - Optional card-chrome intro above the facts (#40).
 * @param showDescription - Whether to render the description paragraph.
 * @returns The rendered facts, or `null` when the row has neither a company
 * nor a title — a relationship pointing at a half-filled row renders nothing
 * rather than an empty bordered box.
 *
 * @remarks **Reduced motion is honoured by construction**: this view has no
 * transition, no transform and no reveal-on-scroll, so there is nothing for
 * `prefers-reduced-motion` to suppress. Every colour is declared as a
 * light/dark pair from the same zinc/teal vocabulary the résumé card and
 * `ArticleMeta` chips already use, so the two Work surfaces read as one thing.
 *
 * The logo is decorative: the adjacent company name carries the accessible
 * identity, so it is `aria-hidden` and has an empty `alt` — the same call
 * `ArticleMeta` makes for an author avatar.
 */
export function WorkHistoryEntry({
  facts,
  heading,
  intro,
  showDescription = true,
}: {
  facts: WorkHistoryEntryFacts
  heading?: string | null
  intro?: string | null
  showDescription?: boolean
}) {
  const company = facts.company?.trim() ?? ''
  const title = facts.title?.trim() ?? ''
  if (!company && !title) return null

  const period = periodLabel(facts.startYear, facts.endYear)
  const description = showDescription ? facts.description?.trim() : ''
  const logoUrl = facts.logoUrl
    ? getOptimizedImageUrl(facts.logoUrl, { width: 80 })
    : null
  // `CardChromeHeader` renders the chrome heading as the section's `<h2>`, so
  // the company name has to step down to `<h3>` when chrome is present or the
  // page ends up with two competing `<h2>`s for one section. With no chrome
  // there is no `<h2>` to sit under, and skipping straight to `<h3>` would
  // leave a gap in the outline — so it takes the `<h2>` itself.
  const CompanyHeading = heading?.trim() ? 'h3' : 'h2'

  return (
    // A plain wrapper, not a `<section>`: the block's server `Component`
    // already opens one, and nesting a second would add a landmark for the
    // same content.
    <div>
      <CardChromeHeader heading={heading} intro={intro} />
      <div className="not-prose rounded-2xl border border-zinc-100 p-6 dark:border-zinc-700/40">
        <div className="flex items-start gap-4">
          {logoUrl ? (
            <span className="relative mt-1 flex h-12 w-12 flex-none items-center justify-center rounded-full shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                aria-hidden="true"
                className="h-8 w-8 rounded-full object-contain"
              />
            </span>
          ) : null}
          <div className="min-w-0">
            {company ? (
              <CompanyHeading className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                {company}
              </CompanyHeading>
            ) : null}
            {title ? (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {title}
              </p>
            ) : null}
            {period ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="sr-only">Period: </span>
                {facts.startYear ? (
                  <time dateTime={facts.startYear}>{facts.startYear}</time>
                ) : null}
                {' – '}
                {facts.endYear ? (
                  <time dateTime={facts.endYear}>{facts.endYear}</time>
                ) : (
                  'Present'
                )}
              </p>
            ) : null}
          </div>
        </div>
        {description ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
