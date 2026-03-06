'use client'

import { getExternalLinkProps } from '@/lib/link-utils'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { XMarkIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type SearchItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

const SEARCH_CACHE_KEY = 'bp:header-search:index:v2'
const SEARCH_FETCH_TIMEOUT_MS = 8000
const SEARCH_CACHE_TTL_MS = 60 * 1000

type SearchCacheEntry = {
  savedAt: number
  items: SearchItem[]
}

function isSearchItem(value: unknown): value is SearchItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SearchItem>
  return (
    typeof item.title === 'string' &&
    typeof item.description === 'string' &&
    typeof item.date === 'string' &&
    typeof item.href === 'string' &&
    typeof item.searchText === 'string'
  )
}

function sanitizeSearchItems(value: unknown): SearchItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(isSearchItem)
}

export function HeaderSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle')
  const [fetchAttempt, setFetchAttempt] = useState(0)
  const bypassCacheRef = useRef(false)
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const debouncedQuery = useDebouncedValue(query, query.trim() ? 500 : 0)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isOpenShortcut =
        (event.metaKey || event.ctrlKey) && event.key === 'k'
      if (isOpenShortcut) {
        event.preventDefault()
        setIsOpen((value) => !value)
      }
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        if (query.trim().length > 0) {
          setQuery('')
        } else {
          setIsOpen(false)
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, query])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const bypassCache = bypassCacheRef.current
    bypassCacheRef.current = false

    if (!bypassCache) {
      try {
        const raw = sessionStorage.getItem(SEARCH_CACHE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw) as SearchItem[] | SearchCacheEntry
          const cached = Array.isArray(parsed)
            ? ({
                savedAt: Date.now(),
                items: sanitizeSearchItems(parsed),
              } satisfies SearchCacheEntry)
            : parsed
          const savedAt =
            typeof cached.savedAt === 'number' ? cached.savedAt : 0
          const cachedItems = sanitizeSearchItems(cached.items)
          if (
            cachedItems.length > 0 &&
            Date.now() - savedAt <= SEARCH_CACHE_TTL_MS
          ) {
            setItems(cachedItems)
            setLoadState('ready')
            return
          }
          sessionStorage.removeItem(SEARCH_CACHE_KEY)
        }
      } catch {
        // noop: cache parse/storage failures should not break search
      }
    }

    setLoadState('loading')
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      SEARCH_FETCH_TIMEOUT_MS,
    )

    fetch('/api/search', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.text().catch(() => '')
          throw new Error(
            `Search index request failed (${response.status})${body ? `: ${body}` : ''}`,
          )
        }
        return response.json() as Promise<SearchItem[]>
      })
      .then((data: SearchItem[]) => {
        if (controller.signal.aborted) {
          return
        }
        const safeItems = sanitizeSearchItems(data)
        setItems(safeItems)
        setLoadState('ready')
        try {
          const cacheEntry: SearchCacheEntry = {
            savedAt: Date.now(),
            items: safeItems,
          }
          sessionStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cacheEntry))
        } catch {
          // noop
        }
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return
        }
        setItems([])
        setLoadState('error')
      })
      .finally(() => {
        clearTimeout(timeoutId)
      })

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [isOpen, fetchAttempt])

  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return items.slice(0, 8)
    }

    const lowered = debouncedQuery.toLowerCase()
    return items
      .filter(
        (item) =>
          item.title.toLowerCase().includes(lowered) ||
          item.description.toLowerCase().includes(lowered) ||
          (item.searchText ?? '').toLowerCase().includes(lowered),
      )
      .slice(0, 10)
  }, [items, debouncedQuery])
  const queryText = debouncedQuery.trim()

  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, filteredItems.length)
    setActiveIndex(-1)
  }, [filteredItems])

  function focusResult(index: number) {
    const count = filteredItems.length
    if (count === 0) {
      return
    }

    const normalized = ((index % count) + count) % count
    const target = resultRefs.current[normalized]
    if (!target) {
      return
    }

    target.focus()
    setActiveIndex(normalized)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/90 text-sm text-zinc-500 shadow-lg ring-1 shadow-zinc-800/5 ring-zinc-900/5 backdrop-blur-sm transition hover:text-teal-500 dark:bg-zinc-800/90 dark:text-zinc-400 dark:ring-white/10 dark:hover:text-teal-400"
        aria-label="Open search (Command+K or Control+K)"
        title="Search (⌘K / Ctrl+K)"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4">
          <path
            d="M13 13l4 4m-2-9a7 7 0 11-14 0 7 7 0 0114 0z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/50 p-4 pt-24"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false)
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:ring-zinc-700">
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (!filteredItems.length) {
                    return
                  }

                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    focusResult(activeIndex < 0 ? 0 : activeIndex + 1)
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    focusResult(
                      activeIndex < 0
                        ? filteredItems.length - 1
                        : activeIndex - 1,
                    )
                  } else if (event.key === 'Enter' && activeIndex >= 0) {
                    event.preventDefault()
                    resultRefs.current[activeIndex]?.click()
                  }
                }}
                placeholder="Search articles"
                className="w-full rounded-md px-3 py-2 text-base outline outline-zinc-300 focus:outline-teal-500 sm:text-sm dark:bg-zinc-800 dark:outline-zinc-600"
              />
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close search"
                title="Close search"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-96 space-y-2 overflow-auto">
              {loadState === 'loading' && (
                <p className="p-3 text-sm text-zinc-500">Loading articles...</p>
              )}
              {filteredItems.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  {...getExternalLinkProps(item.href)}
                  ref={(element) => {
                    resultRefs.current[index] = element
                  }}
                  onFocus={() => {
                    setActiveIndex(index)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      focusResult(index + 1)
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      focusResult(index - 1)
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      focusResult(0)
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      focusResult(filteredItems.length - 1)
                    }
                  }}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-lg p-3 transition hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 focus-visible:ring-inset dark:hover:bg-zinc-800 dark:focus-visible:ring-teal-400/70"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {item.description}
                  </p>
                </Link>
              ))}
              {loadState === 'error' && (
                <div className="flex items-center justify-between gap-3 p-3">
                  <p className="text-sm text-red-500">
                    Unable to load search index right now.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        sessionStorage.removeItem(SEARCH_CACHE_KEY)
                      } catch {
                        // noop
                      }
                      bypassCacheRef.current = true
                      setLoadState('loading')
                      setFetchAttempt((current) => current + 1)
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-300 transition hover:bg-zinc-100 dark:text-zinc-300 dark:ring-zinc-600 dark:hover:bg-zinc-800"
                  >
                    Retry
                  </button>
                </div>
              )}
              {loadState !== 'loading' &&
                loadState !== 'error' &&
                filteredItems.length === 0 && (
                  <p className="p-3 text-sm text-zinc-500">
                    {queryText
                      ? `No articles found for the search term "${queryText}".`
                      : 'No articles found.'}
                  </p>
                )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
