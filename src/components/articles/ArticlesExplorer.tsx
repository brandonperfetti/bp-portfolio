'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { type ArticleWithSlug } from '@/lib/articles'
import { formatDate } from '@/lib/formatDate'
import { getExternalLinkProps } from '@/lib/link-utils'
import { useDebouncedValue } from '@/lib/useDebouncedValue'

function getAuthor(article: ArticleWithSlug) {
  if (typeof article.author === 'string') {
    return { name: article.author, role: '', href: '#', image: '' }
  }

  return {
    name: article.author?.name ?? 'Brandon Perfetti',
    role: article.author?.role ?? '',
    href: article.author?.href ?? '#',
    image: article.author?.image ?? '',
  }
}

export function ArticlesExplorer({
  articles,
}: {
  articles: ArticleWithSlug[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [category, setCategory] = useState(
    searchParams.get('category') ?? 'All',
  )
  const debouncedQuery = useDebouncedValue(query, query.trim() ? 180 : 0)

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '')
    setCategory(searchParams.get('category') ?? 'All')
  }, [searchParams])

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
    return () => {
      document.body.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const categories = useMemo(() => {
    const values = new Set<string>()
    for (const article of articles) {
      const title = article.category?.title
      if (title) {
        values.add(title)
      }
    }

    return ['All', ...Array.from(values).sort()]
  }, [articles])

  const filtered = useMemo(() => {
    return articles.filter((article) => {
      const matchesCategory =
        category === 'All' || article.category?.title === category

      const normalizedQuery = debouncedQuery.trim().toLowerCase()
      const matchesQuery =
        normalizedQuery.length === 0 ||
        article.title.toLowerCase().includes(normalizedQuery) ||
        article.description.toLowerCase().includes(normalizedQuery) ||
        (article.searchText ?? '').toLowerCase().includes(normalizedQuery)

      return matchesCategory && matchesQuery
    })
  }, [articles, category, debouncedQuery])

  const queryText = debouncedQuery.trim()

  const updateUrl = useCallback(
    (nextQuery: string, nextCategory: string) => {
      const currentQueryString = searchParams.toString()
      const params = new URLSearchParams(searchParams.toString())

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
  }, [category, debouncedQuery, updateUrl])

  return (
    <div>
      <div className="space-y-4 rounded-2xl border border-zinc-100 p-4 dark:border-zinc-700/40">
        <div className="relative">
          <input
            ref={searchInputRef}
            type="search"
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value
              setQuery(nextQuery)
            }}
            placeholder="Search articles"
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
        <div className="flex flex-wrap gap-2">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setCategory((current) => (current === item ? 'All' : item))
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                category === item
                  ? 'bg-teal-500 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 dark:hover:text-zinc-100'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
        {filtered.map((article) => {
          const author = getAuthor(article)

          return (
            <article
              key={article.slug}
              className="flex flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-700/40 dark:bg-zinc-900"
            >
              {article.image && (
                <div className="relative mb-4 overflow-hidden rounded-xl">
                  <Image
                    src={article.image}
                    alt={article.title}
                    width={1200}
                    height={630}
                    unoptimized
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <time dateTime={article.date}>{formatDate(article.date)}</time>
                {article.readingTimeMinutes && (
                  <span>{article.readingTimeMinutes} min read</span>
                )}
                {article.category?.title && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                    {article.category.title}
                  </span>
                )}
              </div>

              <h2 className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                <Link href={`/articles/${article.slug}`}>{article.title}</Link>
              </h2>
              <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                {article.description}
              </p>

              <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-700/40">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  <Link
                    href={author.href}
                    {...getExternalLinkProps(author.href)}
                  >
                    {author.name}
                  </Link>
                </p>
                {author.role && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {author.role}
                  </p>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 mb-12 text-sm text-zinc-500">
          {queryText && category !== 'All'
            ? `No articles found for the search term "${queryText}" in the "${category}" category.`
            : queryText
              ? `No articles found for the search term "${queryText}".`
              : category !== 'All'
                ? `No articles found in the "${category}" category.`
                : 'No articles found.'}
        </p>
      )}
    </div>
  )
}
