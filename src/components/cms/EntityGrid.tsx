import Image from 'next/image'

import { Card } from '@/components/Card'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import type { CmsEntityItem } from '@/lib/cms/types'

function LinkIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M15.712 11.823a.75.75 0 1 0 1.06 1.06l-1.06-1.06Zm-4.95 1.768a.75.75 0 0 0 1.06-1.06l-1.06 1.06Zm-2.475-1.414a.75.75 0 1 0-1.06-1.06l1.06 1.06Zm4.95-1.768a.75.75 0 1 0-1.06 1.06l1.06-1.06Zm3.359.53-.884.884 1.06 1.06.885-.883-1.061-1.06Zm-4.95-2.12 1.414-1.415L12 6.344l-1.415 1.413 1.061 1.061Zm0 3.535a2.5 2.5 0 0 1 0-3.536l-1.06-1.06a4 4 0 0 0 0 5.656l1.06-1.06Zm4.95-4.95a2.5 2.5 0 0 1 0 3.535L17.656 12a4 4 0 0 0 0-5.657l-1.06 1.06Zm1.06-1.06a4 4 0 0 0-5.656 0l1.06 1.06a2.5 2.5 0 0 1 3.536 0l1.06-1.06Zm-7.07 7.07.176.177 1.06-1.06-.176-.177-1.06 1.06Zm-3.183-.353.884-.884-1.06-1.06-.884.883 1.06 1.06Zm4.95 2.121-1.414 1.414 1.06 1.06 1.415-1.413-1.06-1.061Zm0-3.536a2.5 2.5 0 0 1 0 3.536l1.06 1.06a4 4 0 0 0 0-5.656l-1.06 1.06Zm-4.95 4.95a2.5 2.5 0 0 1 0-3.535L6.344 12a4 4 0 0 0 0 5.656l1.06-1.06Zm-1.06 1.06a4 4 0 0 0 5.657 0l-1.061-1.06a2.5 2.5 0 0 1-3.535 0l-1.061 1.06Zm7.07-7.07-.176-.177-1.06 1.06.176.178 1.06-1.061Z"
        fill="currentColor"
      />
    </svg>
  )
}

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
