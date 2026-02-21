import { readFile } from 'node:fs/promises'
import path from 'node:path'

import glob from 'fast-glob'

interface Article {
  title: string
  description: string
  author:
    | string
    | {
        href?: string
        name?: string
        role?: string
        image?: string
      }
  category?: {
    href?: string
    title?: string
  }
  date: string
  image?: string
  readingTimeMinutes?: number
}

export interface ArticleWithSlug extends Article {
  slug: string
  searchText: string
}

async function importArticle(
  articleFilename: string,
): Promise<ArticleWithSlug> {
  const { article } = (await import(`../app/articles/${articleFilename}`)) as {
    default: React.ComponentType
    article: Article
  }
  const filePath = path.join(
    process.cwd(),
    'src',
    'app',
    'articles',
    articleFilename,
  )
  const fileContent = await readFile(filePath, 'utf8')

  return {
    slug: articleFilename.replace(/(\/page)?\.mdx$/, ''),
    readingTimeMinutes: estimateReadingTimeMinutes(fileContent),
    searchText: buildSearchText(fileContent),
    ...article,
  }
}

function estimateReadingTimeMinutes(content: string) {
  const cleaned = cleanArticleContent(content)

  const words = cleaned.match(/[A-Za-z0-9']+/g)?.length ?? 0
  return Math.max(1, Math.round(words / 230))
}

function cleanArticleContent(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^import .*$/gm, ' ')
    .replace(/^export .*$/gm, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
}

function buildSearchText(content: string) {
  return cleanArticleContent(content)
    .replace(/[#>*_\-\[\]\(\)!]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export async function getAllArticles() {
  const articleFilenames = await glob('*/page.mdx', {
    cwd: './src/app/articles',
  })

  const articles = await Promise.all(articleFilenames.map(importArticle))

  return articles.sort((a, z) => +new Date(z.date) - +new Date(a.date))
}
