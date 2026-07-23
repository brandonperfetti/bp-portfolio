'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { TechCard } from '@/components/tech/TechCard'
import type { CmsEntityItem } from '@/lib/cms/types'
import type { TechSignalSummary } from '@/lib/tech/githubSignals'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

const CATEGORY_BY_NAME: Record<string, string> = {
  JavaScript: 'Language',
  TypeScript: 'Language',
  'Node.js': 'Language',
  GraphQL: 'Language',
  'Express.js': 'Framework',
  'Next.js': 'Framework',
  Remix: 'Framework',
  Nuxt: 'Framework',
  Gatsby: 'Framework',
  'React Router': 'Framework',
  React: 'Frontend',
  Redux: 'Frontend',
  'Vue.js': 'Frontend',
  Pinia: 'Frontend',
  'Tailwind CSS': 'Frontend',
  'Tailwind UI': 'Frontend',
  'Headless UI': 'Frontend',
  'Radix UI': 'Frontend',
  'shadcn/ui': 'Frontend',
  TanStack: 'Tooling',
  Vite: 'Tooling',
  NPM: 'Tooling',
  Yarn: 'Tooling',
  'The Epic Stack': 'Tooling',
  Zod: 'Tooling',
  Clerk: 'Tooling',
  'Keystone.js': 'Tooling',
  Resend: 'Tooling',
  'Digital Ocean': 'Infra',
  'Fly.io': 'Infra',
  Netlify: 'Infra',
  Vercel: 'Infra',
  Jest: 'Testing',
  Playwright: 'Testing',
  'Testing Library': 'Testing',
  Vitest: 'Testing',
  'MongoDB Atlas': 'Data',
  Supabase: 'Data',
}

function resolveCategory(item: CmsEntityItem) {
  const explicit = item.category?.trim()
  if (explicit) {
    return explicit
  }
  return CATEGORY_BY_NAME[item.name] ?? 'Tooling'
}

type SortMode = 'name' | 'active'

/**
 * Interactive tech-stack visualization (wow moment #3): debounced search,
 * category filter chips, A–Z / most-active sorting, and live GitHub activity
 * badges with expandable evidence — all URL-synced.
 *
 * Syncs `q`/`category`/`sort` state to URL params and supports `/` keyboard
 * focus shortcut for quick filtering. Motion (scroll reveal, hover lift,
 * expand) degrades to a static grid under `prefers-reduced-motion`.
 *
 * @param items CMS tech rows to render.
 * @param signals Slug-keyed live GitHub signal summaries (may be empty when
 * the scan is unconfigured — badges and the sort toggle hide themselves).
 * @returns Rendered tech explorer UI.
 */
export function TechExplorer({
  items,
  signals = {},
}: {
  items: CmsEntityItem[]
  signals?: Record<string, TechSignalSummary>
}): ReactElement {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const hasSignals = Object.keys(signals).length > 0
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(
    searchParams.get('category') ?? 'All',
  )
  const [sort, setSort] = useState<SortMode>(
    searchParams.get('sort') === 'active' ? 'active' : 'name',
  )
  const debouncedQuery = useDebouncedValue(query, query.trim() ? 350 : 0)

  const normalizedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        category: resolveCategory(item),
      })),
    [items],
  )

  const categories = useMemo(() => {
    const values = new Set<string>()
    for (const item of normalizedItems) {
      if (item.category) {
        values.add(item.category)
      }
    }
    return ['All', ...Array.from(values).sort()]
  }, [normalizedItems])

  useEffect(() => {
    const nextQuery = searchParams.get('q') ?? ''
    const requestedCategory = searchParams.get('category') ?? 'All'
    const nextCategory = categories.includes(requestedCategory)
      ? requestedCategory
      : 'All'
    const nextSort: SortMode =
      searchParams.get('sort') === 'active' ? 'active' : 'name'
    const isInputFocused = searchInputRef.current === document.activeElement

    if (!isInputFocused) {
      setQuery((current) => (current === nextQuery ? current : nextQuery))
    }
    setCategory((current) =>
      current === nextCategory ? current : nextCategory,
    )
    setSort((current) => (current === nextSort ? current : nextSort))
  }, [searchParams, categories])

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false
      }
      const tag = target.tagName
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]') !== null
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      // Guard slash-focus shortcut while typing/editing or using modifier keys.
      const isSlashShortcut =
        event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey
      if (!isSlashShortcut || isTypingTarget(event.target)) {
        return
      }
      event.preventDefault()
      searchInputRef.current?.focus()
    }

    document.body.addEventListener('keydown', onKeyDown)
    return () => document.body.removeEventListener('keydown', onKeyDown)
  }, [])

  const updateUrl = useCallback(
    (nextQuery: string, nextCategory: string, nextSort: SortMode) => {
      const currentQueryString = searchParams.toString()
      const params = new URLSearchParams(currentQueryString)

      if (nextQuery.trim()) {
        params.set('q', nextQuery.trim())
      } else {
        params.delete('q')
      }

      if (nextCategory !== 'All') {
        params.set('category', nextCategory)
      } else {
        params.delete('category')
      }

      if (nextSort === 'active') {
        params.set('sort', 'active')
      } else {
        params.delete('sort')
      }

      const queryString = params.toString()
      if (queryString === currentQueryString) {
        return
      }

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      })
    },
    [pathname, router, searchParams],
  )

  useEffect(() => {
    updateUrl(debouncedQuery, category, sort)
  }, [debouncedQuery, category, sort, updateUrl])

  const filteredItems = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase()
    const matches = normalizedItems.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesQuery =
        normalizedQuery.length === 0 ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        (item.description ?? '').toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery) ||
        (item.link?.label ?? '').toLowerCase().includes(normalizedQuery) ||
        (item.link?.href ?? '').toLowerCase().includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })

    if (sort === 'active') {
      // Signal-backed items first by score, then everything else A–Z.
      return [...matches].sort((a, b) => {
        const scoreA = signals[a.slug]?.score ?? -1
        const scoreB = signals[b.slug]?.score ?? -1
        if (scoreA !== scoreB) {
          return scoreB - scoreA
        }
        return a.name.localeCompare(b.name)
      })
    }
    return matches
  }, [normalizedItems, debouncedQuery, category, sort, signals])
  const normalizedQueryText = debouncedQuery.trim()

  return (
    <div className="space-y-8">
      <div className="space-y-4 rounded-2xl border border-zinc-100 p-4 dark:border-zinc-700/40">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tech"
            aria-label="Search technologies"
            className={`w-full rounded-md bg-white px-3 py-2 text-base outline outline-zinc-300 focus:outline-teal-500 sm:text-sm dark:bg-zinc-800 dark:outline-zinc-600 ${
              query.trim() ? 'pr-3' : 'pr-10'
            }`}
          />
          {!query.trim() && (
            <span className="pointer-events-none absolute inset-y-0 right-3 hidden items-center text-xs font-medium text-zinc-400 sm:inline-flex dark:text-zinc-500">
              /
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter technologies by category"
          >
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setCategory((current) => (current === item ? 'All' : item))
                }}
                aria-pressed={category === item}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80 ${
                  category === item
                    ? 'bg-teal-500 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          {hasSignals ? (
            <div
              className="flex gap-1 rounded-full bg-zinc-100 p-1 dark:bg-zinc-800"
              role="group"
              aria-label="Sort technologies"
            >
              {(
                [
                  { mode: 'name', label: 'A–Z' },
                  { mode: 'active', label: 'Most active' },
                ] as const
              ).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSort(mode)}
                  aria-pressed={sort === mode}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/80 dark:focus-visible:ring-teal-400/80 ${
                    sort === mode
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {normalizedQueryText && category !== 'All'
            ? `Showing ${filteredItems.length} results for "${normalizedQueryText}" in ${category}.`
            : normalizedQueryText
              ? `Showing ${filteredItems.length} results for "${normalizedQueryText}".`
              : category !== 'All'
                ? `Showing ${filteredItems.length} results in ${category}.`
                : `Showing ${filteredItems.length} technologies.`}
        </p>
      </div>

      <ScrollReveal targets="li">
        <ul
          role="list"
          className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filteredItems.map((tech, index) => (
            <TechCard
              key={
                tech.slug ||
                tech.link?.href ||
                `${tech.name}-${tech.category || 'uncategorized'}-${index}`
              }
              item={tech}
              signal={signals[tech.slug]}
            />
          ))}
        </ul>
      </ScrollReveal>

      {filteredItems.length === 0 && (
        <p className="text-sm text-zinc-500">
          No technologies found for your current query/filter.
        </p>
      )}
    </div>
  )
}
