import { formatDate } from '@/lib/formatDate'

export function ArticleHeader({
  title,
  date,
}: {
  title: string
  date: string
}) {
  return (
    <header className="flex flex-col">
      <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-800 sm:text-5xl dark:text-zinc-100">
        {title}
      </h1>
      <time
        dateTime={date}
        className="order-first flex items-center text-base text-zinc-400 dark:text-zinc-500"
      >
        <span className="h-4 w-0.5 rounded-full bg-zinc-200 dark:bg-zinc-500" />
        <span className="ml-3">{formatDate(date)}</span>
      </time>
    </header>
  )
}
