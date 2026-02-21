'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { getExternalLinkProps } from '@/lib/link-utils'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

type SearchItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

export function HeaderSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
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
    if (!isOpen || items.length > 0) {
      return
    }

    setIsLoading(true)
    fetch('/api/search')
      .then((response) => response.json())
      .then((data: SearchItem[]) => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setIsLoading(false))
  }, [isOpen, items.length])

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
              {isLoading && (
                <p className="p-3 text-sm text-zinc-500">Loading articles...</p>
              )}
              {filteredItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  {...getExternalLinkProps(item.href)}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-lg p-3 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {item.description}
                  </p>
                </Link>
              ))}
              {!isLoading && filteredItems.length === 0 && (
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
