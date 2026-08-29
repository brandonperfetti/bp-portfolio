import { cacheLife, cacheTag } from 'next/cache'
import { NextResponse } from 'next/server'

import { getSearchArticles } from '@/lib/articles'
import { CMS_TAGS } from '@/lib/cms/cache'

type SearchPayloadItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

// Process-local last-known-good payload used only as a best-effort emergency fallback.
let lastSuccessfulPayload: SearchPayloadItem[] | null = null

async function buildSearchPayload(): Promise<SearchPayloadItem[]> {
  const articles = await getSearchArticles()
  return articles.map((article) => ({
    title: article.title,
    description: article.description,
    date: article.date,
    href: `/articles/${article.slug}`,
    searchText: article.searchText,
  }))
}

// Plain `'use cache'` (in-memory, no 2 MB per-item ceiling) — the search index
// serializes the full flattened article bodies, which blew past the
// `unstable_cache`/Data-Cache 2 MB limit (#76). Purged by `cacheTag('posts')`,
// the same tag the Posts hooks already revalidate on publish/delete.
async function getPersistedSearchPayload(): Promise<SearchPayloadItem[]> {
  'use cache'
  cacheTag(CMS_TAGS.articles)
  cacheLife('cmsContent')
  return buildSearchPayload()
}

export async function GET() {
  try {
    const payload = await getPersistedSearchPayload()
    lastSuccessfulPayload = payload
    return NextResponse.json(payload)
  } catch (error) {
    const stalePayload = lastSuccessfulPayload

    if (stalePayload) {
      return NextResponse.json(stalePayload, {
        headers: {
          'x-search-stale': '1',
        },
      })
    }

    console.error('[api/search] failed and no stale payload available', {
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json([], { status: 503 })
  }
}
