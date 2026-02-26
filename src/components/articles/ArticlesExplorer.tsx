'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { type ArticleWithSlug } from '@/lib/articles'
import { formatDate } from '@/lib/formatDate'
import { getOptimizedImageUrl } from '@/lib/image-utils'
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
  const isDev = process.env.NODE_ENV !== 'production'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [topic, setTopic] = useState(
    searchParams.get('topic') ?? searchParams.get('category') ?? 'All',
  )
  const debouncedQuery = useDebouncedValue(query, query.trim() ? 500 : 0)

  useEffect(() => {
    const nextQuery = searchParams.get('q') ?? ''
    const nextTopic =
      searchParams.get('topic') ?? searchParams.get('category') ?? 'All'
    const isInputFocused = searchInputRef.current === document.activeElement

    // Keep typing stable: don't overwrite local input value while user is actively editing.
    if (!isInputFocused) {
      setQuery((current) => (current === nextQuery ? current : nextQuery))
    }

    setTopic((current) => (current === nextTopic ? current : nextTopic))
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

  const topics = useMemo(() => {
    const values = new Set<string>()
    for (const article of articles) {
      for (const item of article.topics ?? []) {
        if (item) {
          values.add(item)
        }
      }
      for (const item of article.tech ?? []) {
        if (item) {
          values.add(item)
        }
      }
    }

    return ['All', ...Array.from(values).sort()]
  }, [articles])

  const filtered = useMemo(() => {
    return articles.filter((article) => {
      const taxonomyValues = Array.from(
        new Set([...(article.topics ?? []), ...(article.tech ?? [])]),
      )
      const matchesTopic = topic === 'All' || taxonomyValues.includes(topic)

      const normalizedQuery = debouncedQuery.trim().toLowerCase()
      const matchesQuery =
        normalizedQuery.length === 0 ||
        article.title.toLowerCase().includes(normalizedQuery) ||
        article.description.toLowerCase().includes(normalizedQuery) ||
        (article.topics ?? []).some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ) ||
        (article.tech ?? []).some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ) ||
        (article.searchText ?? '').toLowerCase().includes(normalizedQuery)

      return matchesTopic && matchesQuery
    })
  }, [articles, topic, debouncedQuery])

  const queryText = debouncedQuery.trim()

  const updateUrl = useCallback(
    (nextQuery: string, nextTopic: string) => {
      const currentQueryString = searchParams.toString()
      const params = new URLSearchParams(searchParams.toString())

      if (nextQuery.trim()) {
        params.set('q', nextQuery.trim())
      } else {
        params.delete('q')
      }

      if (nextTopic !== 'All') {
        params.set('topic', nextTopic)
      } else {
        params.delete('topic')
        params.delete('category')
      }

      const queryString = params.toString()
      if (queryString === currentQueryString) {
        if (isDev) {
          console.debug(
            '[articles:explorer] skip router.replace (no URL change)',
            {
              currentQueryString,
              query: nextQuery.trim(),
              topic: nextTopic,
            },
          )
        }
        return
      }

      if (isDev) {
        console.debug('[articles:explorer] apply router.replace', {
          from: currentQueryString,
          to: queryString,
          query: nextQuery.trim(),
          topic: nextTopic,
        })
      }

      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      })
    },
    [isDev, pathname, router, searchParams],
  )

  useEffect(() => {
    updateUrl(debouncedQuery, topic)
  }, [topic, debouncedQuery, updateUrl])

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
          {topics.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTopic((current) => (current === item ? 'All' : item))
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                topic === item
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
          const topicValues = (article.topics ?? [])
            .map((item) => item.trim())
            .filter(Boolean)
          const techValues = (article.tech ?? [])
            .map((item) => item.trim())
            .filter(Boolean)
          const normalizedActiveTopic =
            topic === 'All' ? '' : topic.toLowerCase()

          const matchedTopicChip = topicValues.find(
            (item) =>
              normalizedActiveTopic &&
              item.toLowerCase() === normalizedActiveTopic,
          )
          const matchedTechChip = techValues.find(
            (item) =>
              normalizedActiveTopic &&
              item.toLowerCase() === normalizedActiveTopic,
          )

          // Prefer chips matching the active topic; otherwise use the first available.
          // Hide tech chip when it would duplicate the topic chip.
          const topicChip = matchedTopicChip ?? topicValues[0]
          const techChip =
            (matchedTechChip ?? techValues[0])?.toLowerCase() ===
            topicChip?.toLowerCase()
              ? undefined
              : (matchedTechChip ?? techValues[0])

          return (
            <article
              key={article.slug}
              className="group relative flex flex-col rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-700/40 dark:bg-zinc-900"
            >
              <div
                aria-hidden="true"
                className="absolute inset-0 z-0 rounded-2xl bg-zinc-50 opacity-0 transition group-hover:opacity-100 dark:bg-zinc-800/40"
              />
              <Link
                href={`/articles/${article.slug}`}
                aria-label={`Read article: ${article.title}`}
                className="absolute inset-0 z-20 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70"
              />
              {article.image && (
                <div className="relative z-10 mb-4 overflow-hidden rounded-xl">
                  <Image
                    src={getOptimizedImageUrl(article.image, {
                      width: 960,
                      height: 540,
                      crop: 'fill',
                    })}
                    alt={article.title}
                    width={960}
                    height={540}
                    sizes="(min-width: 1280px) 24rem, (min-width: 1024px) 30vw, 100vw"
                    className="aspect-[16/9] w-full object-cover"
                  />
                </div>
              )}

              <div className="relative z-10 text-xs text-zinc-500 dark:text-zinc-400">
                <div className="flex items-center gap-2">
                  <time dateTime={article.date}>
                    {formatDate(article.date)}
                  </time>
                  {article.readingTimeMinutes && (
                    <span>{article.readingTimeMinutes} min read</span>
                  )}
                </div>
                {(topicChip || techChip) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {topicChip && (
                      <span className="max-w-[11rem] truncate rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                        {topicChip}
                      </span>
                    )}
                    {techChip && (
                      <span className="max-w-[11rem] truncate rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                        {techChip}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <h2 className="relative z-10 mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                <span>{article.title}</span>
              </h2>
              <p className="relative z-10 mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
                {article.description}
              </p>

              <div className="relative z-10 mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-700/40">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  {author.name}
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
          {queryText && topic !== 'All'
            ? `No articles found for the search term "${queryText}" in the "${topic}" topic.`
            : queryText
              ? `No articles found for the search term "${queryText}".`
              : topic !== 'All'
                ? `No articles found in the "${topic}" topic.`
                : 'No articles found.'}
        </p>
      )}
    </div>
  )
}
