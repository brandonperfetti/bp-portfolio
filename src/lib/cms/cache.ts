export const CMS_REVALIDATE = {
  articles: 300,
  articleDetail: 300,
  search: 1800,
  projects: 900,
  tech: 900,
  uses: 900,
  workHistory: 900,
  authors: 900,
  pages: 300,
  settings: 300,
  navigation: 300,
} as const

export const CMS_TAGS = {
  articles: 'cms:articles',
  article: (slug: string) => `cms:article:${slug}`,
  projects: 'cms:projects',
  tech: 'cms:tech',
  uses: 'cms:uses',
  workHistory: 'cms:work-history',
  authors: 'cms:authors',
  pages: 'cms:pages',
  settings: 'cms:settings',
  navigation: 'cms:navigation',
} as const
