import Image from 'next/image'

import { Card } from '@/components/Card'
import { LinkIcon } from '@/icons'
import type { CmsEntityItem } from '@/lib/cms/types'
import { getOptimizedImageUrl } from '@/lib/image-utils'

export function EntityGrid({ items }: { items: CmsEntityItem[] }) {
  return (
    <ul
      role="list"
      className="grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3"
    >
      {items.map((item, index) => (
        <Card
          as="li"
          key={`${item.slug || item.name}-${item.link?.href ?? 'no-link'}-${index}`}
        >
          {item.logo ? (
            <div className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 sm:h-12 sm:w-12 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
              <Image
                src={getOptimizedImageUrl(item.logo, {
                  width: 96,
                  height: 96,
                  crop: 'fit',
                })}
                alt={item.name}
                width={48}
                height={48}
                sizes="2.25rem"
                className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              />
            </div>
          ) : null}
          <h2 className="mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
            {item.link?.href ? (
              <Card.Link href={item.link.href}>{item.name}</Card.Link>
            ) : (
              item.name
            )}
          </h2>
          <Card.Description>{item.description}</Card.Description>
          {item.link?.label ? (
            <p className="relative z-10 mt-5 flex text-sm font-medium text-zinc-500 transition group-hover:text-teal-500 dark:text-zinc-300">
              <LinkIcon className="h-6 w-6 flex-none" />
              <span className="ml-2">{item.link.label}</span>
            </p>
          ) : null}
        </Card>
      ))}
    </ul>
  )
}
