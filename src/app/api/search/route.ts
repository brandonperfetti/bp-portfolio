import { NextResponse } from 'next/server'

import { getAllArticles } from '@/lib/articles'

export async function GET() {
  const articles = await getAllArticles()
  return NextResponse.json(
    articles.map((article) => ({
      title: article.title,
      description: article.description,
      date: article.date,
      href: `/articles/${article.slug}`,
      searchText: article.searchText,
    })),
  )
}
