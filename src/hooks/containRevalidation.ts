import type { Payload } from 'payload'

/**
 * Run a group of `next/cache` purges so that a revalidation failure can never
 * fail the write that triggered it (#135, #156).
 *
 * @param payload - The request's Payload instance, for its logger.
 * @param subject - What survives the failure, as a noun phrase for the log line
 * (`'post write'`, `'page write'`, `'redirect row'`).
 * @param target - What was being purged, interpolated into the message so a
 * failure names the path (or the surface) that went stale.
 * @param purge - The `revalidatePath`/`revalidateTag` calls to contain.
 *
 * @remarks **Why containment is not optional.** Payload runs `afterChange` and
 * `afterDelete` collection hooks **inside the operation's transaction** —
 * `payload/dist/collections/operations/utilities/update.js:253` writes the row
 * (`if (!isSavingDraft)` guards `db.updateOne`) and `:330-341` runs the hooks
 * after it, so a throw unwinds to `killTransaction`. An exception raised in a
 * purge therefore does not merely lose a cache entry: it rolls back the
 * document, or the redirect row, that was just written.
 *
 * That matters because `revalidatePath`/`revalidateTag` throw
 * `Invariant: static generation store missing` outside a Next request scope —
 * every Local-API script, integration test and job-driven publish. [measured,
 * 2026-09-04, Payload 3.86.0, PostgreSQL 16.13, full committed migration set]
 * a Local-API publish against a real database raises exactly that error from
 * `revalidatePath`; with this wrap it is logged and the write lands.
 *
 * **Why one helper and not one per call site.** #135 wrapped the redirects
 * purge inline; #156 wrapped Posts and Pages. All three bodies were
 * byte-identical, which is the shape that drifts — one call site gaining a
 * `logger.warn` fallback or losing the `err` key while the others do not, so
 * the containment guarantee stops being one guarantee. It is one function with
 * one docblock, and this docblock is the single place the argument lives.
 *
 * **`disableRevalidate` is not a substitute.** The flag only helps callers who
 * know to set it. [measured, 2026-09-04 — a read of every writer under
 * `scripts/`] `scripts/seed-e2e.ts` and `scripts/seed-cms-from-notion.ts` set
 * `context: { disableRevalidate: true }` on every Posts/Pages write;
 * `scripts/migrate-notion-to-payload.ts` sets it **nowhere** and writes both
 * collections, so it is exactly the caller a throw destroys.
 * `scripts/set-admin-password.ts` touches only `users`, and
 * `scripts/backfill-corvus-embeddings.ts` / `scripts/sync-github-repos.ts`
 * write no slug-routed document. **No script in this repo wants revalidation to
 * be fatal** — none inspects a revalidation result, and every one of them would
 * rather land its content than assert that a cache purge happened.
 *
 * Ranking the two outcomes settles it: a swallowed purge costs at most one
 * `cmsContent` TTL of a stale shell, bounded by the `{ expire: 0 }` profile the
 * callers use and by #76; a thrown purge costs the document. The failure is
 * logged at `error`, never silently.
 *
 * **Granularity.** Callers pass a GROUP of purges rather than one call each: the
 * real failure mode is scope-wide (no static-generation store exists at all), so
 * a second call after the first throw would fail identically. Group by what the
 * message needs to name — each document path on its own, the shared list and tag
 * surfaces together.
 */
export const containRevalidation = (
  payload: Pick<Payload, 'logger'>,
  subject: string,
  target: string,
  purge: () => void,
): void => {
  try {
    purge()
  } catch (error) {
    payload.logger.error(
      { err: error },
      `Failed to revalidate ${target}; the ${subject} is kept (#156)`,
    )
  }
}
