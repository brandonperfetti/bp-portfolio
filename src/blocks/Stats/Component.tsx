import type { StatsBlock } from '@/payload-types'

/** Metric band (CMS page builder): large teal values over labels. */
export function StatsComponent(props: StatsBlock) {
  const { items } = props
  if (!items?.length) return null

  return (
    <section className="my-12">
      {/* Static class map — Tailwind cannot see dynamically built names. */}
      <dl
        className={`grid grid-cols-2 gap-8 rounded-2xl border border-zinc-100 p-8 text-center dark:border-zinc-700/40 ${
          items.length === 3
            ? 'lg:grid-cols-3'
            : items.length >= 4
              ? 'lg:grid-cols-4'
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
    </section>
  )
}
