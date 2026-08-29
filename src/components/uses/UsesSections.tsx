'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { Section } from '@/components/Section'
import { TechCard } from '@/components/tech/TechCard'
import {
  ListPagination,
  PAGE_PARAM,
  buildPageQueryString,
  getPageCount,
  getPageItems,
  parsePageParam,
} from '@/components/ui/pagination'
import type { CmsUseSection } from '@/lib/cms/types'

/**
 * Uses entries per page (#88).
 *
 * @remarks Sized above the current corpus (16 items measured when #88 was
 * filed) on purpose: the shared `total > pageSize` threshold makes `/uses` an
 * automatic no-op today — the control renders nothing and every section shows
 * in full — while inheriting the URL contract the moment the collection grows.
 */
const USES_PAGE_SIZE = 48

/**
 * The `/uses` list surface: category sections of tool cards, paginated by the
 * shared `?page=N` contract.
 *
 * @param sections - Category sections from `getCmsUses`, in display order.
 * @returns The visible sections plus, above the threshold, the shared
 * pagination control.
 *
 * @remarks Pagination windows the *flattened* entry list so pages hold a
 * consistent number of cards rather than a ragged number of sections; a
 * section renders only when the current window contains at least one of its
 * entries, and section order is preserved. Extracted from the `/uses` route so
 * the page stays a server component: this client boundary is the only thing
 * that reads `useSearchParams`, and it renders under `<Suspense>` so the route
 * remains statically rendered (option (b) — no server-side `searchParams`
 * read anywhere; see #121 for the server-side end state).
 *
 * Uses entries are logo-less by design — no monogram circle (Brandon's call;
 * tech cards keep theirs).
 */
export function UsesSections({ sections }: { sections: CmsUseSection[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const flatEntries = useMemo(
    () =>
      sections.flatMap((section, sectionIndex) =>
        section.items.map((item) => ({ sectionIndex, item })),
      ),
    [sections],
  )

  const totalPages = getPageCount(flatEntries.length, USES_PAGE_SIZE)
  const currentPage = parsePageParam(searchParams.get(PAGE_PARAM), totalPages)

  const visibleSections = useMemo(() => {
    const windowed = getPageItems(flatEntries, currentPage, USES_PAGE_SIZE)
    const bySectionIndex = new Map<number, CmsUseSection['items']>()
    for (const entry of windowed) {
      const bucket = bySectionIndex.get(entry.sectionIndex)
      if (bucket) {
        bucket.push(entry.item)
      } else {
        bySectionIndex.set(entry.sectionIndex, [entry.item])
      }
    }
    return sections
      .map((section, sectionIndex) => ({
        key: `${sectionIndex}-${section.title}`,
        title: section.title,
        items: bySectionIndex.get(sectionIndex) ?? [],
      }))
      .filter((section) => section.items.length > 0)
  }, [currentPage, flatEntries, sections])

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
    <div className="space-y-20">
      {visibleSections.map((section) => (
        <Section key={section.key} title={section.title}>
          <ScrollReveal targets="li" revealKey={String(currentPage)}>
            <ul
              role="list"
              className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2"
            >
              {section.items.map((item) => (
                <TechCard key={item.slug} item={item} monogram={false} />
              ))}
            </ul>
          </ScrollReveal>
        </Section>
      ))}

      <ListPagination
        page={currentPage}
        totalPages={totalPages}
        buildHref={buildPageHref}
        onNavigate={goToPage}
        label="Uses pagination"
      />
    </div>
  )
}
