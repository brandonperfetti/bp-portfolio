import Image from 'next/image'

import { CMSLink } from '@/components/cms/CMSLink'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import type { FeatureCardGridBlock, Media } from '@/payload-types'

const media = (m: unknown): Media | null =>
  m && typeof m === 'object' ? (m as Media) : null

/**
 * Feature card grid (CMS page builder): 1/2/3-column responsive grid in the
 * site's card language — icon disc, eyebrow, title, copy, optional link.
 * Reveal + hover motion come from the shared wrappers (reduced-motion safe).
 */
export function FeatureCardGridComponent(props: FeatureCardGridBlock) {
  const { heading, intro, cards } = props
  if (!cards?.length) return null

  return (
    <section className="my-12">
      {heading ? (
        <h2 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl dark:text-zinc-100">
          {heading}
        </h2>
      ) : null}
      {intro ? (
        <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">
          {intro}
        </p>
      ) : null}
      <ScrollReveal targets="li">
        <ul
          role="list"
          className={`mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 ${
            cards.length >= 3 ? 'lg:grid-cols-3' : ''
          }`}
        >
          {cards.map((card, index) => {
            const icon = media(card.icon)
            return (
              <HoverMotionCard as="li" key={card.id ?? index}>
                <div className="relative flex h-full flex-col items-start rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm dark:border-zinc-700/40 dark:bg-zinc-900">
                  {icon?.url ? (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
                      <Image
                        src={icon.url}
                        alt=""
                        aria-hidden
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded object-contain"
                      />
                    </div>
                  ) : null}
                  {card.eyebrow ? (
                    <p className="mt-4 text-xs font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-400">
                      {card.eyebrow}
                    </p>
                  ) : null}
                  <h3 className="mt-2 text-base font-semibold text-zinc-800 dark:text-zinc-100">
                    {card.title}
                  </h3>
                  {card.copy ? (
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      {card.copy}
                    </p>
                  ) : null}
                  {card.enableLink ? (
                    <div className="mt-4">
                      <CMSLink link={card.link} />
                    </div>
                  ) : null}
                </div>
              </HoverMotionCard>
            )
          })}
        </ul>
      </ScrollReveal>
    </section>
  )
}
