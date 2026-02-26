export function NotFoundState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-700/40 dark:bg-zinc-900 dark:text-zinc-300">
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="mt-2">{description}</p>
    </div>
  )
}
