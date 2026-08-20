import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import type { StatsBlock } from '@/payload-types'

/**
 * Metric band (CMS page builder): large teal values over labels.
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Two metrics per row is the floor at every width — that has always
 * been the mobile layout. Three and four-up now key off the band's own
 * container instead of the viewport (see `hostContext.ts`), so a metric band
 * in a rail stays two-up instead of splitting into four ~110px slivers.
 */
export function StatsComponent(
  props: StatsBlock & { hosted?: BlockHostContext },
) {
  const { items } = props
  if (!items?.length) return null

  return (
    <section className={blockRhythmClass(props.hosted)}>
      {/* The band is its own query container; the `dl` carries no margin, so
          this wrapper changes nothing about the section's spacing. */}
      <div className="@container">
        {/* Static class map — Tailwind cannot see dynamically built names. */}
        <dl
          className={`grid grid-cols-2 gap-8 rounded-2xl border border-zinc-100 p-8 text-center dark:border-zinc-700/40 ${
            items.length === 3
              ? '@3xl:grid-cols-3'
              : items.length >= 4
                ? '@3xl:grid-cols-4'
                : ''
          }`}
        >
          {items.map((item, index) => (
            <div key={item.id ?? index}>
              <dd className="text-3xl font-bold tracking-tight text-teal-700 sm:text-4xl dark:text-teal-400">
                {item.value}
              </dd>
              <dt className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
