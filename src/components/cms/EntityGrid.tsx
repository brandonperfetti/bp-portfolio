import Image from 'next/image'
import Link from 'next/link'
import { useId } from 'react'

import { Card } from '@/components/Card'
import { LinkIcon } from '@/icons'
import type { CmsEntityItem } from '@/lib/cms/types'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'

export function EntityGrid({ items }: { items: CmsEntityItem[] }) {
  const instanceId = useId().replace(/[:]/g, '')

  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3"
    >
      {items.map((item, index) => {
        // Stable heading id wires the full-card overlay link to visible heading text.
        // This preserves full-card click UX while improving heading/link semantics.
        const headingId = `entity-grid-heading-${instanceId}-${
          item.slug || item.name.toLowerCase().replace(/\s+/g, '-')
        }-${index}`

        return (
          <Card
            as="li"
            key={`${item.slug || item.name}-${item.link?.href ?? 'no-link'}-${index}`}
          >
            {item.link?.href ? (
              <>
                {/* Keep overlay/background and absolute link separate so the full
                  card is clickable while content remains visibly layered above. */}
                <div className="absolute -inset-x-4 -inset-y-6 z-0 scale-95 bg-zinc-50 opacity-0 transition group-hover:scale-100 group-hover:opacity-100 sm:-inset-x-6 sm:rounded-2xl dark:bg-zinc-800/50" />
                <Link
                  href={item.link.href}
                  {...getExternalLinkProps(item.link.href)}
                  aria-labelledby={headingId}
                  className="absolute -inset-x-4 -inset-y-6 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 sm:-inset-x-6 sm:rounded-2xl dark:focus-visible:ring-teal-400/70"
                />
              </>
            ) : null}
            {item.logo ? (
              <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 sm:h-12 sm:w-12 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
                <Image
                  src={getOptimizedImageUrl(item.logo, {
                    width: 96,
                    height: 96,
                    crop: 'fit',
                  })}
                  alt=""
                  width={48}
                  height={48}
                  sizes="2.25rem"
                  className="h-8 w-8 object-contain sm:h-9 sm:w-9"
                />
              </div>
            ) : null}
            <h2
              id={headingId}
              className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100"
            >
              <span className="relative z-10">{item.name}</span>
            </h2>
            <Card.Description>{item.description}</Card.Description>
            {item.link?.label ? (
              <p className="relative z-10 mt-5 flex text-sm font-medium text-zinc-500 transition group-hover:text-teal-500 dark:text-zinc-300">
                <LinkIcon className="h-6 w-6 flex-none" />
                <span className="ml-2">{item.link.label}</span>
              </p>
            ) : null}
          </Card>
        )
      })}
    </ul>
  )
}
