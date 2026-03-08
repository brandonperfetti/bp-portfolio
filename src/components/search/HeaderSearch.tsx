'use client'

import { getExternalLinkProps } from '@/lib/link-utils'
import { usePrefersReducedMotion } from '@/lib/motion/usePrefersReducedMotion'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { gsap } from 'gsap'
import Link from 'next/link'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

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

function dedupeSearchItemsByHref(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>()
  const deduped: SearchItem[] = []

  for (const item of items) {
    if (!item.href || seen.has(item.href)) {
      continue
    }
    seen.add(item.href)
    deduped.push(item)
  }

  return deduped
}

/**
 * Global header search modal with keyboard and cached-index behavior.
 *
 * Side effects:
 * - Registers/removes global `keydown` listeners for `Cmd/Ctrl+K` and `Escape`.
 * - Reads/writes sessionStorage search index cache (`SEARCH_CACHE_KEY`).
 * - Fetches `/api/search` on demand when cache is stale/bypassed.
 */
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
  const modalOverlayRef = useRef<HTMLDivElement | null>(null)
  const modalPanelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
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
          // Backward-compat: older cache payloads stored a raw SearchItem[].
          // Wrap arrays into SearchCacheEntry, but force stale timestamp so we
          // refresh from /api/search instead of treating legacy payloads as fresh.
          const cached = Array.isArray(parsed)
            ? ({
                savedAt: 0,
                items: sanitizeSearchItems(parsed),
              } satisfies SearchCacheEntry)
            : parsed
          const savedAt =
            typeof cached.savedAt === 'number' ? cached.savedAt : 0
          const rawCachedItems = (cached as Partial<SearchCacheEntry>).items
          const cachedItems = sanitizeSearchItems(rawCachedItems)
          const hasInvalidCachedItems =
            Array.isArray(rawCachedItems) &&
            rawCachedItems.length !== cachedItems.length
          if (!Array.isArray(rawCachedItems) || hasInvalidCachedItems) {
            sessionStorage.removeItem(SEARCH_CACHE_KEY)
          } else if (Date.now() - savedAt <= SEARCH_CACHE_TTL_MS) {
            setItems(cachedItems)
            setLoadState('ready')
            return
          } else {
            sessionStorage.removeItem(SEARCH_CACHE_KEY)
          }
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
      .then((data: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        if (!Array.isArray(data)) {
          throw new Error('Search index response was not an array')
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
      return dedupeSearchItemsByHref(items).slice(0, 8)
    }

    const lowered = debouncedQuery.toLowerCase()
    return dedupeSearchItemsByHref(
      items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowered) ||
          item.description.toLowerCase().includes(lowered) ||
          (item.searchText ?? '').toLowerCase().includes(lowered),
      ),
    ).slice(0, 10)
  }, [items, debouncedQuery])
  const queryText = debouncedQuery.trim()

  useEffect(() => {
    resultRefs.current = resultRefs.current.slice(0, filteredItems.length)
    if (isOpen) {
      setActiveIndex(-1)
    }
  }, [filteredItems, isOpen])

  useEffect(() => {
    if (!isOpen || prefersReducedMotion) {
      return
    }

    const ctx = gsap.context(() => {
      if (modalOverlayRef.current) {
        gsap.fromTo(
          modalOverlayRef.current,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.3, ease: 'power2.out' },
        )
      }

      if (modalPanelRef.current) {
        gsap.fromTo(
          modalPanelRef.current,
          { autoAlpha: 0, y: 10, scale: 0.988 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.42,
            ease: 'power2.out',
          },
        )
      }
    }, modalOverlayRef)

    return () => ctx.revert()
  }, [isOpen, prefersReducedMotion])

  useLayoutEffect(() => {
    if (!isOpen || prefersReducedMotion || !listRef.current) {
      return
    }
    if (loadState !== 'ready') {
      return
    }

    listRef.current.scrollTo({ top: 0, left: 0, behavior: 'auto' })

    const ctx = gsap.context(() => {
      const nodes = listRef.current?.querySelectorAll('[data-search-result]')
      if (!nodes?.length) {
        return
      }

      gsap.set(nodes, { autoAlpha: 0, y: 8 })
      gsap.to(nodes, {
        autoAlpha: 1,
        y: 0,
        duration: 0.44,
        stagger: 0.075,
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      })
    }, listRef)

    return () => ctx.revert()
  }, [filteredItems, isOpen, loadState, prefersReducedMotion])

  function focusResult(index: number) {
    const count = filteredItems.length
    if (count === 0) {
      return
    }

    // Wrap index in both directions so ArrowUp/ArrowDown cycles results.
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
          ref={modalOverlayRef}
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-900/50 p-4 pt-24"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false)
            }
          }}
        >
          <div
            ref={modalPanelRef}
            className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl ring-1 ring-zinc-900/10 dark:bg-zinc-900 dark:ring-zinc-700"
          >
            <div className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  // Clear any previously armed selection immediately while
                  // debounced filtering catches up.
                  setActiveIndex(-1)
                }}
                onFocus={() => setActiveIndex(-1)}
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

            <div
              ref={listRef}
              className="mt-4 max-h-96 space-y-2 overflow-auto"
            >
              {loadState === 'loading' && (
                <div className="space-y-2 px-1 py-1" aria-live="polite">
                  <p className="px-2 text-xs text-zinc-500">
                    Loading articles...
                  </p>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div
                      key={`loading-row-${index}`}
                      className="rounded-lg border border-zinc-200/70 p-3 dark:border-zinc-700/60"
                    >
                      <div className="h-3.5 w-[68%] animate-pulse rounded bg-zinc-200/85 dark:bg-zinc-700/80" />
                      <div className="mt-2 h-2.5 w-[88%] animate-pulse rounded bg-zinc-200/65 dark:bg-zinc-700/55" />
                      <div className="mt-1.5 h-2.5 w-[74%] animate-pulse rounded bg-zinc-200/55 dark:bg-zinc-700/45" />
                    </div>
                  ))}
                </div>
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
                  data-search-result
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
