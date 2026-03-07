'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Card } from '@/components/Card'
import LinkIcon from '@/icons/LinkIcon'
import type { CmsEntityItem } from '@/lib/cms/types'
import { getOptimizedImageUrl } from '@/lib/image-utils'
import { getExternalLinkProps } from '@/lib/link-utils'
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

/**
 * Interactive tech catalog with debounced search and category filtering.
 *
 * Syncs `q`/`category` state to URL params and supports `/` keyboard focus
 * shortcut for quick filtering.
 *
 * @param items CMS tech rows to render.
 * @returns Rendered tech explorer UI.
 */
export function TechExplorer({
  items,
}: {
  items: CmsEntityItem[]
}): ReactElement {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState('All')
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
    const isInputFocused = searchInputRef.current === document.activeElement

    if (!isInputFocused) {
      setQuery((current) => (current === nextQuery ? current : nextQuery))
    }
    setCategory((current) =>
      current === nextCategory ? current : nextCategory,
    )
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
    (nextQuery: string, nextCategory: string) => {
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
    updateUrl(debouncedQuery, category)
  }, [debouncedQuery, category, updateUrl])

  const filteredItems = useMemo(() => {
    const normalizedQuery = debouncedQuery.trim().toLowerCase()
    return normalizedItems.filter((item) => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesQuery =
        normalizedQuery.length === 0 ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery) ||
        (item.link?.label ?? '').toLowerCase().includes(normalizedQuery) ||
        (item.link?.href ?? '').toLowerCase().includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })
  }, [normalizedItems, debouncedQuery, category])
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
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {normalizedQueryText && category !== 'All'
            ? `Showing ${filteredItems.length} results for "${normalizedQueryText}" in ${category}.`
            : normalizedQueryText
              ? `Showing ${filteredItems.length} results for "${normalizedQueryText}".`
              : category !== 'All'
                ? `Showing ${filteredItems.length} results in ${category}.`
                : `Showing ${filteredItems.length} technologies.`}
        </p>
      </div>

      <ul
        role="list"
        className="grid grid-cols-1 gap-x-12 gap-y-16 sm:grid-cols-2 lg:grid-cols-3"
      >
        {filteredItems.map((tech) => (
          <Card
            className="h-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-700/40 dark:bg-zinc-900"
            as="li"
            key={tech.slug || tech.name}
          >
            {tech.link?.href ? (
              <>
                <div className="absolute inset-0 z-0 rounded-2xl bg-zinc-50 opacity-0 transition group-hover:opacity-100 dark:bg-zinc-800/40" />
                <Link
                  href={tech.link.href}
                  {...getExternalLinkProps(tech.link.href)}
                  aria-label={`Open technology: ${tech.name}`}
                  className="absolute inset-0 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 dark:focus-visible:ring-teal-400/70"
                />
              </>
            ) : null}
            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md ring-1 shadow-zinc-800/5 ring-zinc-900/5 dark:border dark:border-zinc-700/50 dark:bg-zinc-800 dark:ring-0">
              {tech.logo ? (
                <Image
                  height={48}
                  width={48}
                  src={getOptimizedImageUrl(tech.logo, {
                    width: 96,
                    height: 96,
                    crop: 'fit',
                  })}
                  alt={tech.name}
                  className="h-8 w-8 rounded object-contain"
                  sizes="2rem"
                />
              ) : null}
            </div>
            <h2 className="relative z-10 mt-6 text-base font-semibold text-zinc-800 dark:text-zinc-100">
              {tech.name}
            </h2>
            <p className="relative z-10 mt-2 line-clamp-4 text-sm text-zinc-600 dark:text-zinc-400">
              {tech.description}
            </p>
            <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tech.category}
              </span>
            </div>
            {tech.link?.label ? (
              <p className="relative z-10 mt-4 flex text-sm font-medium text-zinc-400 transition group-hover:text-teal-500 dark:text-zinc-200">
                <LinkIcon className="h-6 w-6 flex-none" />
                <span className="ml-2">{tech.link.label}</span>
              </p>
            ) : null}
          </Card>
        ))}
      </ul>

      {filteredItems.length === 0 && (
        <p className="text-sm text-zinc-500">
          No technologies found for your current query/filter.
        </p>
      )}
    </div>
  )
}
