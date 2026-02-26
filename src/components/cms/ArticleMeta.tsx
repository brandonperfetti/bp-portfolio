export function ArticleMeta({
  author,
  actions,
  readingTimeMinutes,
  category,
  topics,
  tech,
}: {
  author?:
    | string
    | {
        href?: string
        name?: string
        role?: string
      }
  actions?: React.ReactNode
  readingTimeMinutes?: number
  category?: string
  topics?: string[]
  tech?: string[]
}) {
  const authorMeta =
    typeof author === 'string'
      ? {
          name: author,
          role: '',
          href: undefined,
        }
      : author
        ? {
            name: author.name ?? 'Brandon Perfetti',
            role: author.role ?? '',
            href: author.href,
          }
        : null

  const topicChips = Array.from(
    new Set((topics ?? []).map((item) => item.trim()).filter(Boolean)),
  ).slice(0, 3)
  const topicLookup = new Set(topicChips.map((item) => item.toLowerCase()))
  const techChips = Array.from(
    new Set(
      (tech ?? [])
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item) => !topicLookup.has(item.toLowerCase())),
    ),
  ).slice(0, 3)

  if (
    !authorMeta &&
    !readingTimeMinutes &&
    !category &&
    topicChips.length === 0 &&
    techChips.length === 0
  ) {
    return null
  }

  return (
    <div className="mt-5 space-y-3 text-xs text-zinc-500 dark:text-zinc-400">
      {authorMeta || actions ? (
        <div className="flex items-start justify-between gap-3">
          {authorMeta ? (
            <div className="border-l border-zinc-200 pl-3 dark:border-zinc-700/60">
              {authorMeta.href ? (
                <a
                  href={authorMeta.href}
                  className="text-sm font-semibold text-zinc-800 transition hover:text-teal-500 dark:text-zinc-100 dark:hover:text-teal-400"
                >
                  {authorMeta.name}
                </a>
              ) : (
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  {authorMeta.name}
                </p>
              )}
              {authorMeta.role ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {authorMeta.role}
                </p>
              ) : null}
            </div>
          ) : (
            <span />
          )}
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {readingTimeMinutes ? <div>{readingTimeMinutes} min read</div> : null}
      {!topicChips.length && category ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Topic:</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
            {category}
          </span>
        </div>
      ) : null}
      {topicChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Topics:</span>
          {topicChips.map((item, index) => (
            <span
              key={`topic-${item}-${index}`}
              className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
      {techChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-400 dark:text-zinc-500">Tech:</span>
          {techChips.map((item, index) => (
            <span
              key={`tech-${item}-${index}`}
              className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200"
            >
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
