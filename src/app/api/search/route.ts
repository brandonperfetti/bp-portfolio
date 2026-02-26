import { NextResponse } from 'next/server'

import { getSearchArticles } from '@/lib/articles'

type SearchPayloadItem = {
  title: string
  description: string
  date: string
  href: string
  searchText: string
}

let lastGoodSearchPayload: SearchPayloadItem[] | null = null

export async function GET() {
  try {
    const articles = await getSearchArticles()
    const payload = articles.map((article) => ({
      title: article.title,
      description: article.description,
      date: article.date,
      href: `/articles/${article.slug}`,
      searchText: article.searchText,
    }))

    lastGoodSearchPayload = payload
    return NextResponse.json(payload)
  } catch (error) {
    if (lastGoodSearchPayload) {
      return NextResponse.json(lastGoodSearchPayload, {
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
