'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useId, useMemo } from 'react'

import { Card } from '@/components/Card'
import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import {
  ListPagination,
  PAGE_PARAM,
  buildPageQueryString,
  getPageCount,
  getPageItems,
  parsePageParam,
} from '@/components/ui/pagination'
import { LinkIcon } from '@/icons'
import type { CmsEntityItem } from '@/lib/cms/types'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'

/**
 * Entity cards per page (#88).
 *
 * @remarks Sized above the current projects corpus on purpose: the shared
 * `total > pageSize` threshold makes `/projects` an automatic no-op today
 * while inheriting the URL contract the moment the collection grows.
 */
const ENTITY_GRID_PAGE_SIZE = 24

/**
 * Responsive card grid for CMS entity lists (projects, tech stack): logo,
 * name, description, optional full-card link — one shared surface so every
 * entity collection renders identically.
 *
 * @param items - The full entity collection to render.
 * @param label - Names the pagination landmark for this grid.
 * @returns The card grid plus, above the threshold, the shared pagination
 * control.
 *
 * @remarks Each card's overlay link is wired to its visible heading via a
 * `useId`-scoped `aria-labelledby`, keeping the full-card click target
 * accessible without duplicating the name; keys fall back to name+index
 * because CMS items may lack slugs.
 *
 * @remarks Adopts the shared `?page=N` contract (#88) as client windowing over
 * `items` — no data-layer change; the whole set still arrives as a prop.
 * Because the contract owns one global `page` param, a single grid per route
 * is assumed; a second paginated list on the same page would need its own
 * param name. Reading `page` uses `useSearchParams`, so callers must render
 * this inside a `<Suspense>` boundary to keep the route statically rendered.
 */
export function EntityGrid({
  items,
  label = 'Pagination',
}: {
  items: CmsEntityItem[]
  label?: string
}) {
  const instanceId = useId().replace(/[:]/g, '')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const totalPages = getPageCount(items.length, ENTITY_GRID_PAGE_SIZE)
  const currentPage = parsePageParam(searchParams.get(PAGE_PARAM), totalPages)
  const visibleItems = useMemo(
    () => getPageItems(items, currentPage, ENTITY_GRID_PAGE_SIZE),
    [items, currentPage],
  )

  const buildPageHref = useCallback(
    (nextPage: number) => {
      const queryString = buildPageQueryString(
        searchParams.toString(),
        nextPage,
      )
      return queryString ? `${pathname}?${queryString}` : pathname
    },
    [pathname, searchParams],
  )

  const goToPage = useCallback(
    (nextPage: number) => {
      const currentQueryString = searchParams.toString()
      const queryString = buildPageQueryString(currentQueryString, nextPage)
      if (queryString === currentQueryString) {
        return
      }
      router.push(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  return (
    <>
      <ScrollReveal targets="li" revealKey={String(currentPage)}>
        <ul
          role="list"
          className="grid grid-cols-1 gap-x-12 gap-y-12 sm:grid-cols-2 sm:gap-y-16 lg:grid-cols-3"
        >
          {visibleItems.map((item, index) => {
            const computedSlug =
              item.slug || item.name.toLowerCase().replace(/\s+/g, '-')
            const stableItemKey = computedSlug || `${item.name}-${index}`
            // Stable heading id wires the full-card overlay link to visible heading text.
            // This preserves full-card click UX while improving heading/link semantics.
            const headingId = `entity-grid-heading-${instanceId}-${
              computedSlug
            }-${index}`

            return (
              <HoverMotionCard as="li" key={stableItemKey}>
                <Card>
                  {item.link?.href ? (
                    <>
                      {/* Keep overlay/background and absolute link separate so the full
                      card is clickable while content remains visibly layered above. */}
                      <div
                        data-hover-overlay
                        className="absolute -inset-x-4 -inset-y-6 z-0 scale-95 bg-zinc-50 opacity-0 transition sm:-inset-x-6 sm:rounded-2xl dark:bg-zinc-800/50"
                      />
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
                    <p className="relative z-10 mt-5 flex text-sm font-medium text-zinc-500 dark:text-zinc-300">
                      <LinkIcon data-hover-icon className="h-6 w-6 flex-none" />
                      <span className="ml-2">{item.link.label}</span>
                    </p>
                  ) : null}
                </Card>
              </HoverMotionCard>
            )
          })}
        </ul>
      </ScrollReveal>

      <ListPagination
        className="mt-16"
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildPageHref}
        onNavigate={goToPage}
        label={label}
      />
    </>
  )
}
