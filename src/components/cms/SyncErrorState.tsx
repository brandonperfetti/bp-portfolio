export function SyncErrorState() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
    >
      Content sync is temporarily incomplete. Showing last known-good content.
    </div>
  )
}
