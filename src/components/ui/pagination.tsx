import * as React from 'react'
import { type VariantProps } from 'class-variance-authority'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The single URL parameter name for list pagination (#88).
 *
 * @remarks Absent means page 1. Every list surface reads and writes this one
 * name so `?page=N` means the same thing everywhere and composes with the
 * surface's own filter params (`q`/`topic` on `/articles`,
 * `q`/`category`/`sort` on `/tech`).
 */
export const PAGE_PARAM = 'page'

/** Page numbers to show either side of the current page in the number strip. */
const SIBLING_COUNT = 1

/**
 * Total number of pages a collection occupies at a given page size.
 *
 * @param total - Number of items in the (already filtered) collection.
 * @param pageSize - Items rendered per page; values below 1 are treated as 1.
 * @returns At least 1 — an empty collection is still "page 1 of 1", which is
 * what keeps the `total > pageSize` render threshold a single comparison
 * (`totalPages > 1`) rather than two special cases.
 */
export function getPageCount(total: number, pageSize: number): number {
  const size = Math.max(1, Math.floor(pageSize))
  const count = Math.ceil(Math.max(0, total) / size)
  return Math.max(1, count)
}

/**
 * Parse a raw `?page` value into a usable page number.
 *
 * @param raw - The raw param value (`searchParams.get('page')`).
 * @param totalPages - Page count from {@link getPageCount}.
 * @returns The requested page when it is a whole number within
 * `1..totalPages`, otherwise `1`.
 *
 * @remarks #88 is explicit that these are filtered views, not canonical
 * documents: a non-numeric, zero, negative, fractional or out-of-range `page`
 * clamps to the first page rather than 404ing. Clamping is derived at render
 * time and never written back to the URL, so a shared `?page=99` link degrades
 * to page 1 without the app rewriting someone else's URL under them.
 */
export function parsePageParam(
  raw: string | null | undefined,
  totalPages: number,
): number {
  if (raw == null) {
    return 1
  }
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) {
    return 1
  }
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > totalPages) {
    return 1
  }
  return parsed
}

/**
 * Window a collection down to the items on one page.
 *
 * @param items - The full (already filtered) collection.
 * @param page - 1-based page number, normally from {@link parsePageParam}.
 * @param pageSize - Items per page.
 * @returns The slice of `items` belonging to `page`.
 *
 * @remarks This is the whole of option (b): the surface still receives the
 * complete fetched set and only *renders* a window of it. No data-layer or
 * cache change is implied — see `docs/SEO.md` and issue #121 for the
 * server-side end state this deliberately does not foreclose.
 */
export function getPageItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): T[] {
  const size = Math.max(1, Math.floor(pageSize))
  const start = (Math.max(1, page) - 1) * size
  return items.slice(start, start + size)
}

/**
 * Rewrite a query string so it addresses a given page.
 *
 * @param current - The surface's current query string (or `URLSearchParams`).
 * @param page - Target page number.
 * @returns A query string with `page` set, or removed entirely for page 1.
 *
 * @remarks Page 1 drops the param rather than writing `page=1`, so the
 * first page of every view has exactly one URL — the bare one that stays
 * canonical and sitemap-listed under option (b).
 */
export function buildPageQueryString(
  current: string | URLSearchParams,
  page: number,
): string {
  const params = new URLSearchParams(
    typeof current === 'string' ? current : current.toString(),
  )
  if (page <= 1) {
    params.delete(PAGE_PARAM)
  } else {
    params.set(PAGE_PARAM, String(page))
  }
  return params.toString()
}

/** One slot in the rendered number strip: a page number or a gap marker. */
export type PaginationSlot = number | 'ellipsis'

/**
 * Compute the page numbers (and gaps) to render for a given position.
 *
 * @param page - The current page.
 * @param totalPages - Page count from {@link getPageCount}.
 * @returns First page, last page, the current page with
 * {@link SIBLING_COUNT} neighbours, and `'ellipsis'` markers for the gaps.
 * Short ranges are returned in full with no gaps.
 */
export function getPageWindow(
  page: number,
  totalPages: number,
): PaginationSlot[] {
  // first + last + current + siblings on both sides + two gap markers.
  const maxSlots = SIBLING_COUNT * 2 + 5
  if (totalPages <= maxSlots) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const left = Math.max(2, page - SIBLING_COUNT)
  const right = Math.min(totalPages - 1, page + SIBLING_COUNT)
  const slots: PaginationSlot[] = [1]

  if (left > 2) {
    slots.push('ellipsis')
  }
  for (let current = left; current <= right; current += 1) {
    slots.push(current)
  }
  if (right < totalPages - 1) {
    slots.push('ellipsis')
  }
  slots.push(totalPages)

  return slots
}

/**
 * Pagination landmark — the `<nav>` wrapper of the shadcn/ui primitive.
 *
 * @param props - Standard `<nav>` props; `aria-label` should name the list
 * being paginated when a page has more than one pagination landmark.
 * @returns The navigation landmark element.
 */
function Pagination({
  className,
  ...props
}: React.ComponentProps<'nav'>): React.ReactElement {
  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

/**
 * List container for pagination items.
 *
 * @param props - Standard `<ul>` props.
 * @returns The pagination item list.
 */
function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>): React.ReactElement {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  )
}

/**
 * A single pagination slot.
 *
 * @param props - Standard `<li>` props.
 * @returns The list item wrapper.
 */
function PaginationItem(props: React.ComponentProps<'li'>): React.ReactElement {
  return <li data-slot="pagination-item" {...props} />
}

/**
 * An anchor styled as a pagination control.
 *
 * @param isActive - Marks the current page; emits `aria-current="page"`.
 * @param size - Button size token from `buttonVariants`.
 * @param props - Standard `<a>` props. An `href` is always expected: every
 * rendered control is a real link, so middle-click, copy-link and keyboard
 * activation behave natively.
 * @returns The styled anchor.
 */
function PaginationLink({
  className,
  isActive,
  size = 'icon',
  ...props
}: React.ComponentProps<'a'> & {
  isActive?: boolean
  size?: VariantProps<typeof buttonVariants>['size']
}): React.ReactElement {
  return (
    <a
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({ variant: isActive ? 'outline' : 'ghost', size }),
        'cursor-pointer',
        className,
      )}
      {...props}
    />
  )
}

/**
 * "Previous page" control.
 *
 * @param props - Standard `<a>` props (href, onClick).
 * @returns The previous-page link.
 */
function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>): React.ReactElement {
  return (
    <PaginationLink
      size="default"
      rel="prev"
      className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
      {...props}
    >
      <ChevronLeftIcon />
      <span className="hidden sm:block">Previous</span>
      <span className="sr-only sm:hidden">Previous page</span>
    </PaginationLink>
  )
}

/**
 * "Next page" control.
 *
 * @param props - Standard `<a>` props (href, onClick).
 * @returns The next-page link.
 */
function PaginationNext({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>): React.ReactElement {
  return (
    <PaginationLink
      size="default"
      rel="next"
      className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
      {...props}
    >
      <span className="hidden sm:block">Next</span>
      <span className="sr-only sm:hidden">Next page</span>
      <ChevronRightIcon />
    </PaginationLink>
  )
}

/**
 * Gap marker between non-adjacent page numbers.
 *
 * @param props - Standard `<span>` props.
 * @returns A decorative ellipsis with a screen-reader label.
 */
function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>): React.ReactElement {
  return (
    <span
      aria-hidden="true"
      data-slot="pagination-ellipsis"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
      <span className="sr-only">More pages</span>
    </span>
  )
}

/** Props for {@link ListPagination}. */
export interface ListPaginationProps {
  /** Current page (already clamped by {@link parsePageParam}). */
  page: number
  /** Total pages from {@link getPageCount}. */
  totalPages: number
  /** Builds the shareable href for a target page. */
  buildHref: (page: number) => string
  /** Performs the client-side navigation for a plain left click. */
  onNavigate: (page: number) => void
  /** Names the landmark, e.g. `"Articles pagination"`. */
  label: string
  /** Extra classes for the `<nav>`. */
  className?: string
}

/**
 * The one pagination control every list surface renders (#88).
 *
 * @param props - See {@link ListPaginationProps}.
 * @returns The pagination landmark, or `null` when there is nothing to
 * paginate.
 *
 * @remarks
 * - **Threshold.** Renders nothing when `totalPages <= 1` — i.e. exactly when
 *   `total <= pageSize`. That is the "no special-casing, no dead UI" rule from
 *   #88: `/projects`, `/tech` and `/uses` adopt the identical component and are
 *   automatic no-ops at today's counts, inheriting the behavior the moment they
 *   grow.
 * - **Real links.** Every control is an `<a href>` built by `buildHref`, so the
 *   URL is visible on hover, ⌘/Ctrl/middle-click opens a new tab, and the
 *   control set is meaningful without JavaScript. A plain left click is
 *   intercepted for a client-side navigation instead.
 * - **Boundaries are omitted, not disabled.** "Previous" is absent on page 1
 *   and "Next" on the last page. A disabled anchor is either unfocusable
 *   (`<a>` with no `href`) or lies about its role; omitting the control is the
 *   pattern used by accessible design systems and keeps the story's
 *   `a11y: { test: 'error' }` gate clean.
 * - **A boundary step hands focus to the current-page link.** Omitting the
 *   control is right, but it has a cost that has to be paid back: a keyboard
 *   user who activates "Next" on the second-to-last page destroys the very
 *   element they were focused on, and focus falls to `document.body` — so the
 *   next Tab restarts from the top of the document (WCAG 2.4.3). The flag is
 *   set ONLY on the two steps that remove their own control, so ordinary
 *   page-number navigation keeps native focus behavior untouched. The
 *   current-page link is the target because it is the one control guaranteed
 *   to exist on every page, and it already carries `aria-current="page"`.
 * - This component is deliberately router-free: it takes `buildHref` and
 *   `onNavigate` rather than reaching for `next/navigation`. That keeps it
 *   renderable from a plain Storybook story and reusable unchanged by the
 *   server-side end state in #121, where `onNavigate` simply falls away.
 */
export function ListPagination({
  page,
  totalPages,
  buildHref,
  onNavigate,
  label,
  className,
}: ListPaginationProps): React.ReactElement | null {
  // Both hooks run before the `totalPages <= 1` early return: hooks may not be
  // conditional, and this component legitimately renders nothing.
  const currentPageRef = React.useRef<HTMLAnchorElement>(null)
  const restoreFocusRef = React.useRef(false)

  React.useEffect(() => {
    if (!restoreFocusRef.current) {
      return
    }
    restoreFocusRef.current = false
    currentPageRef.current?.focus()
  }, [page])

  if (totalPages <= 1) {
    return null
  }

  const slots = getPageWindow(page, totalPages)
  const navigateOnPlainClick =
    (target: number) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      // Leave modified clicks to the browser so the href keeps its native
      // "open in a new tab" behavior.
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return
      }
      event.preventDefault()
      onNavigate(target)
    }

  return (
    <Pagination aria-label={label} className={className}>
      <PaginationContent>
        {page > 1 ? (
          <PaginationItem>
            <PaginationPrevious
              href={buildHref(page - 1)}
              onClick={(event) => {
                // Only the step that lands ON page 1, because that is the
                // render in which this control stops existing.
                restoreFocusRef.current = page - 1 === 1
                navigateOnPlainClick(page - 1)(event)
              }}
            />
          </PaginationItem>
        ) : null}
        {slots.map((slot, index) =>
          slot === 'ellipsis' ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={slot}>
              <PaginationLink
                ref={slot === page ? currentPageRef : undefined}
                href={buildHref(slot)}
                isActive={slot === page}
                aria-label={`Go to page ${slot}`}
                onClick={navigateOnPlainClick(slot)}
              >
                {slot}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        {page < totalPages ? (
          <PaginationItem>
            <PaginationNext
              href={buildHref(page + 1)}
              onClick={(event) => {
                // Mirror of Previous: only the step that lands on the LAST
                // page removes this control.
                restoreFocusRef.current = page + 1 === totalPages
                navigateOnPlainClick(page + 1)(event)
              }}
            />
          </PaginationItem>
        ) : null}
      </PaginationContent>
    </Pagination>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
