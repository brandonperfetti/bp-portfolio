/**
 * Storybook stand-ins for server blocks that reach the Payload Local API
 * (unbundleable in the preview). Aliased in main.ts via viteFinal.
 */
export function ArticlesArchiveComponent() {
  return (
    <div className="my-12 rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
      ArticlesArchive renders live posts at runtime (server block — not
      previewable in Storybook).
    </div>
  )
}

export function WorkHistoryCardComponent() {
  return (
    <div className="my-12 rounded-2xl border border-dashed border-zinc-300 p-8 text-sm text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
      WorkHistoryCard renders the work-history collection at runtime (server
      block — not previewable in Storybook).
    </div>
  )
}
