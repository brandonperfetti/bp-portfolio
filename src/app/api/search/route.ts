import { unstable_cache } from 'next/cache'
import { NextResponse } from 'next/server'

import { getSearchArticles } from '@/lib/articles'
import { CMS_REVALIDATE, CMS_TAGS } from '@/lib/cms/cache'

type SearchPayloadItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

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

const getPersistedSearchPayload = unstable_cache(
  async () => buildSearchPayload(),
  ['api', 'search', 'stale-fallback'],
  {
    revalidate: CMS_REVALIDATE.search,
    tags: [CMS_TAGS.articles],
  },
)

export async function GET() {
  try {
    const payload = await buildSearchPayload()
    return NextResponse.json(payload)
  } catch (error) {
    const stalePayload = await getPersistedSearchPayload().catch(
      () => null as SearchPayloadItem[] | null,
    )

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
