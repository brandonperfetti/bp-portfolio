import { SimpleLayout } from '@/components/SimpleLayout'
import { getAllArticles, type ArticleWithSlug } from '@/lib/articles'
import { formatDate } from '@/lib/formatDate'
import { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

function Article({ article }: { article: ArticleWithSlug }) {
  return (
    <article
      key={article.slug}
      className="dark:bg-zinc-80 flex flex-col items-start justify-between rounded-lg p-4 shadow hover:shadow-lg dark:hover:scale-100 dark:hover:bg-zinc-800 dark:hover:opacity-100 dark:hover:shadow-xl"
    >
      <div className="relative w-full">
        <Image
          width="100"
          height="100"
          src={article.image}
          alt=""
          className="aspect-[16/9] w-full rounded-2xl bg-slate-100 object-cover sm:aspect-[2/1] lg:aspect-[3/2]"
        />
        <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-slate-900/10" />
      </div>
      <div className="max-w-xl">
        <div className="mt-8 flex items-center gap-x-4 text-xs">
          <time
            dateTime={article.date}
            className="text-zinc-500 dark:text-zinc-300"
          >
            {formatDate(article.date)}
          </time>
          <Link
            href={article.category?.href}
            className="relative z-10 rounded-full bg-white/90 px-3 text-sm font-medium text-zinc-700 shadow shadow-zinc-800/5 ring-1 ring-zinc-900/5 backdrop-blur hover:bg-teal-300 hover:shadow-xl dark:bg-zinc-800/90 dark:text-zinc-200 dark:ring-white/10 dark:hover:bg-teal-500"
          >
            {article.category?.title}
          </Link>
        </div>
        <div className="group relative">
          <h3 className="mt-3 text-lg font-semibold leading-6 text-slate-900 group-hover:text-teal-500 dark:text-white dark:group-hover:text-teal-400">
            <Link href={`/articles/${article.slug}`}>
              <span className="absolute inset-0" />
              {article.title}
            </Link>
          </h3>
          <p className="mt-5 line-clamp-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {article.description}
          </p>
        </div>
        <div className="relative mt-4 flex items-center gap-x-4 border-t-2 border-zinc-100 pt-4 dark:border-zinc-600">
          <Image
            height={100}
            width={100}
            src={article.author.image}
            alt=""
            className="h-10 w-10 rounded-full bg-zinc-50 dark:bg-zinc-300"
          />
          <div className="text-sm leading-6">
            <p className="font-semibold text-zinc-600 dark:text-zinc-400">
              <Link href={article.author.href}>
                <span className="absolute inset-0" />
                {article.author.name}
              </Link>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              {article.author.role}
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}

export const metadata: Metadata = {
  title: 'Articles',
  description:
    'All of my long-form thoughts on programming, leadership, product design, and more, collected in chronological order.',
}

function filterArticles(
  articles: ArticleWithSlug[],
  category: string | string[] | undefined,
): ArticleWithSlug[] {
  if (!category) return articles // Return all articles if no category is specified

  // Normalize and filter articles based on category
  const normalizedCategory =
    typeof category === 'string'
      ? category.toLowerCase().replace(/\s+/g, '')
      : ''
  return articles.filter(
    (article) =>
      article.category?.title.toLowerCase().replace(/\s+/g, '') ===
      normalizedCategory,
  )
}

export default async function ArticlesIndex({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  // console.log('Search Params:', searchParams) // Add this to check what you get in production

  // const articles = await getAllArticles()
  let articles = await getAllArticles()
  console.log('Articles Fetched:', articles.length) // Check how many articles are fetched

  // TODO: Figure out why filtering articles returns 0 articles on production - could be related to calling searchParams
  const filteredArticles = filterArticles(
    articles,
    searchParams?.category || '',
  )
  console.log('Filtered Articles Fetched:', filteredArticles.length) // Check how many articles are fetched

  return (
    <SimpleLayout
      title="Writing on mindset, software design, company building, and the tech industry."
      intro="All of my long-form thoughts on mindset, programming, leadership, product design, and more, collected in chronological order."
    >
      <div>
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {filteredArticles.map((article) => (
            <Article key={article.slug} article={article} />
          ))}
        </div>
      </div>
    </SimpleLayout>
  )
}
