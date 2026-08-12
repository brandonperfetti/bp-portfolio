import Image from 'next/image'

import { type BlockHostContext, blockRhythmClass } from '@/blocks/hostContext'
import type { Media, TestimonialsBlock } from '@/payload-types'

const media = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Testimonial card grid (CMS page builder).
 *
 * @param props - The stored block, plus `hosted`: where it is rendering.
 * @remarks Column count comes from the grid's own container width rather
 * than the viewport (see `hostContext.ts`), so quotes in a rail stack instead
 * of shrinking to unreadable strips. The query container is the wrapper that
 * already carries the list's `mt-8`, leaving margin collapsing untouched.
 */
export function TestimonialsComponent(
  props: TestimonialsBlock & { hosted?: BlockHostContext },
) {
  const { heading, items } = props
  if (!items?.length) return null

  return (
    <section className={blockRhythmClass(props.hosted)}>
      {heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {heading}
        </h2>
      ) : null}
      <div className="@container mt-8">
        <ul
          role="list"
          className={`grid grid-cols-1 gap-6 ${
            items.length > 1 ? '@md:grid-cols-2' : ''
          } ${items.length >= 3 ? '@3xl:grid-cols-3' : ''}`}
        >
          {items.map((item, index) => {
            const avatar = media(item.avatar)
            return (
              <li key={item.id ?? index}>
                <figure className="flex h-full flex-col justify-between rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
                  <blockquote className="text-sm text-zinc-600 dark:text-zinc-400">
                    “{item.quote}”
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    {avatar?.url ? (
                      <Image
                        src={avatar.url}
                        alt=""
                        aria-hidden
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                        {item.name}
                      </p>
                      {item.role ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {item.role}
                        </p>
                      ) : null}
                    </div>
                  </figcaption>
                </figure>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
