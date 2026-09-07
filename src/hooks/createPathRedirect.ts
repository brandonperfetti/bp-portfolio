import type { CollectionAfterChangeHook } from 'payload'

import { revalidatePath } from 'next/cache'

import {
  isSlugRoutedCollection,
  publicPathFor,
  publicPathForSlug,
} from '@/fields/slug/slugPaths'
import {
  readPreviousPublishedPath,
  readPreviousPublishedSlug,
} from '@/hooks/capturePublishedSlug'
import { containRevalidation } from '@/hooks/containRevalidation'

/**
 * `afterChange` hook that keeps a moved published URL reachable: when a
 * published Post or Page stops being served at the path it was being served at,
 * that old **path** gets a `redirects` row pointing at the document.
 *
 * @remarks **The unit is the path, not the slug (#150).** This hook shipped as
 * `createSlugRedirect` and built both ends of the row out of a slug plus a fixed
 * prefix (`publicPathForSlug`). That is correct for exactly the document shape
 * #120 knew about — an unplaced post and a top-level page — and wrong for every
 * shape #148/#153 introduced. [measured, #153 pg-tier run 2026-09-03, quoted on
 * issue #150 comment 5530738984] renaming a post placed at `work2/dup` logged
 * `Slug changed: redirecting /articles/…-dup -> /articles/…-dup2` — both ends
 * spelled in the archive vocabulary for a document living under `/work2`, while
 * the URL that actually moved got no row at all and became a hard 404. Building
 * `from` from the captured **path** closes that, and it closes three more cases
 * with the same expression, because they are all the same case:
 *
 * | What the editor did | `from` | `to` |
 * | --- | --- | --- |
 * | renamed an unplaced post | `/articles/old` | `/articles/new` |
 * | renamed a top-level page | `/old` | `/new` |
 * | renamed a placed post | `/work/old` | `/work/new` |
 * | **un-placed** a post (#150, second residue) | `/work/old` | `/articles/old` |
 * | re-parented a page | `/work/x` | `/experience/x` |
 *
 * The un-place row is not a special branch: un-placing changes the served path
 * without changing the slug, so a slug-keyed writer saw `from === to` and wrote
 * nothing, and a path-keyed one sees a genuine move. The first two rows are the
 * #120 behaviour, byte for byte — `publicPathFor` answers `/articles/<slug>` for
 * a post with no `path` and `/<slug>` for a page whose `path` is its slug, which
 * is every document that existed before hierarchy.
 *
 * **When it fires.** Only on an `update` that lands the document in a published
 * state, where a *previously published* path exists and differs from the new
 * one. A draft save, a first publish, and an unmoved URL all return without
 * writing — there is no old public URL to preserve in any of those cases.
 *
 * **The old path comes from {@link capturePublishedSlug}, not `previousDoc`.**
 * With autosave enabled (both Posts and Pages run a 100ms interval) Payload's
 * `previousDoc` is the latest *version* — the autosaved draft — so on the real
 * admin rename path it already carries the NEW slug and reports
 * `_status: 'draft'`. Reading it here made this hook silently never fire for
 * the main editorial flow. The `beforeChange` companion reads the main table
 * row instead, which a draft save never touches, and stashes the true
 * pre-write published slug **and served path** on `req.context`. `previousDoc`
 * is deliberately not used at all.
 *
 * **Why the escape hatch is still called `context.disableSlugRedirect`.** The
 * same question as the hook's own name, with a different answer, and the
 * difference is who can say the word. A hook name is internal: every reference
 * to it is in this repository and the compiler finds them all. A `context` key
 * is a **caller-supplied string** — it is how a script, a seed, a backfill or an
 * MCP write asks this hook to stand down, and none of those callers is in this
 * repository or visible to the compiler. Renaming it would not fail a build
 * anywhere; it would silently start ignoring an opt-out that a caller is still
 * passing, and the symptom would be redirect rows appearing from a bulk job
 * that had correctly asked for none. Every in-repo reference could be renamed
 * inside this batch's fence — the blast radius is not the reason to keep it.
 * The reason is that the flag's radius does not end at the fence.
 *
 * It also still reads true. The flag means "do not write a redirect for this
 * write", which is exactly what it meant when the redirect was keyed on a slug;
 * only the key changed, not the thing being disabled. The subtree cascade in
 * `pageHierarchy.ts` is its main caller, and passes it for the D4 reason —
 * descendants are covered by one prefix row, so each of them writing its own
 * would be the design this ticket rejected.
 *
 * **Why the companion is still called `capturePublishedSlug`.** #150 proposed
 * renaming it to `capturePublishedPath`. It already captures both (#155 added
 * the path stash), so the rename is purely cosmetic — and it is not free: the
 * import lines it would move live in `src/collections/Posts/index.ts` and
 * `src/collections/Pages/index.ts`, the two files a parallel lane is editing in
 * the same batch. A rename that buys no behaviour is not worth a merge
 * conflict in the two files every collection change touches. The reader names
 * say which stash they answer ({@link readPreviousPublishedPath} /
 * {@link readPreviousPublishedSlug}), which is where the ambiguity actually
 * would have been.
 *
 * **Why the redirect targets the document, not a path.** `to.type: 'reference'`
 * makes the row resolve through the document's *current* slug at read time
 * (`src/lib/cms/redirectsRepo.ts`). Renaming `a → b → c` therefore leaves
 * `/articles/a` and `/articles/b` both resolving straight to `/articles/c`:
 * redirect chains cannot form by construction, so there is no chain-collapsing
 * pass to get wrong. It also means a row needs no maintenance when the document
 * is renamed again.
 *
 * **Why the row ALSO snapshots the target's path (#178).** A reference that
 * always resolves forward is exactly what breaks a URL captured under a prefix
 * row whose target then moves again: the descendant's own row is keyed at the
 * path the descendant had at ITS capture, which spells the ancestor the way the
 * ancestor was spelled then — so rewriting a request onto the ancestor's
 * *current* path produces a URL no row is keyed at, and the descendant's row is
 * never consulted. `toPathAtCapture` freezes the spelling that row was keyed
 * against, and {@link resolveRedirect} uses it as a lookup key before falling
 * back to the current path. Rows stay immutable — this writer never revisits a
 * row it wrote for a different move.
 *
 * **Idempotency.** `from` is `unique: true` on the plugin's collection, so a
 * repeated rename back and forth would collide. The hook reads first and
 * updates the existing row instead of stacking a second one — which is also the
 * "old path already redirected somewhere else" case: it is repointed, not
 * duplicated.
 *
 * **Why it also revalidates the old path, and why that stays here (#132).**
 * `revalidatePost` purges the old path only on the *unpublish* transition
 * (`previousDoc._status === 'published' && doc._status !== 'published'`), so a
 * published→published rename leaves `/articles/<old>` serving its prerendered
 * shell and the new redirect would never be consulted. Purging it here is what
 * makes the old URL fall through to the not-found branch that reads the
 * redirect. Honours `context.disableRevalidate` like the other hooks; the row
 * itself is still written.
 *
 * #132 asked whether that purge should move into the revalidation hooks
 * instead. It should not, and the decisive reason is visible one line above:
 * the purge takes `from` — the exact string just written as the row's `from`,
 * built by `publicPathFor`. The revalidation hooks speak a different path
 * vocabulary (they hand-build `/articles/${slug}`, and `revalidatePage` maps
 * `home` to `/` where `publicPathForSlug` says `/home`), so a purge issued from
 * there could uncover a path no row was ever written for. Keeping writer and
 * purge in one expression makes them incapable of disagreeing. It also keeps
 * the purge conditional on the write having succeeded — it sits inside this
 * same `try`, after the row lands — rather than on a transition that fires
 * either way. The ownership rule, stated once for both sides: **whoever writes
 * a redirect row purges that row's `from`; the revalidation hooks purge the
 * document's own paths.** The transition matrix is pinned in
 * `revalidatePost.test.ts` and `revalidatePage.test.ts`.
 *
 * A failure here must never fail the editor's publish, so the write is wrapped
 * and logged. The `redirects` cache tag is purged for free: creating the row
 * runs the redirects collection's own `revalidateRedirects` hook.
 *
 * **Two different containments, and they are not interchangeable (#135, #156).**
 * The `try` around the row write exists so a database failure does not fail the
 * publish. The purge inside it goes through `containRevalidation` for a
 * different reason: it runs AFTER the row has landed, so a `revalidatePath`
 * throw would be reported by that `catch` as "Failed to create redirect" — a
 * log line about a row that exists — and would then roll the row back with it,
 * this being an `afterChange` inside the operation's transaction. Containing
 * the purge separately is what keeps the message true and the row safe. Read
 * `containRevalidation`'s docblock for the transaction mechanics and for why
 * `disableRevalidate` (honoured just above the purge) is not a substitute.
 */
export const createPathRedirect: CollectionAfterChangeHook = async ({
  collection,
  context,
  doc,
  operation,
  req,
}) => {
  if (operation !== 'update') return doc
  if (context?.disableSlugRedirect) return doc

  const collectionSlug = collection?.slug
  if (!collectionSlug || !isSlugRoutedCollection(collectionSlug)) return doc

  // The write must land the document published, and a published version must
  // have existed beforehand — no captured path means a first publish.
  if (doc?._status !== 'published') return doc
  // `req.context` first: it is the object `capturePublishedSlug` wrote to, and
  // the only one guaranteed current after a nested Local API call swapped it.
  // Read before this hook makes its own `find`, which swaps it again.
  const previousContext = req.context ?? context

  // The captured path is the served URL, resolved through `publicPathFor` at
  // capture time, so it is already right for a placed post and a nested page.
  // The slug stash is the fallback and nothing more: it covers a `req.context`
  // written by an older capture (a rolling deploy) and a row whose `path` was
  // NULL for a reason `publicPathFor` could not name, and for every document
  // that existed before hierarchy the two agree by construction.
  const from =
    readPreviousPublishedPath(previousContext, collectionSlug, doc.id) ??
    publicPathForSlug(
      collectionSlug,
      readPreviousPublishedSlug(previousContext, collectionSlug, doc.id),
    )
  // `doc`, not `doc.slug`: the document in hand carries its `path`, and a slug
  // alone cannot name `/work/brytecore`. This is the half that makes an
  // un-place a move rather than a no-op.
  const to = publicPathFor(collectionSlug, doc)
  if (!from || !to || from === to) return doc

  const data = {
    from,
    // #150 (D4). A Page can have a subtree; a Post cannot — its `parent` is a
    // Page, so nothing is ever stored beneath it. Marking a page's row as a
    // prefix row is what makes a section move cost ONE row instead of one per
    // descendant, and marking a post's would be a claim about URLs that cannot
    // exist. Stated explicitly rather than left to the field's `defaultValue`,
    // for the same reason `type` is: an `update` of an existing row does not
    // re-apply a default, so a row first written for a post rename and later
    // repointed by a page move must gain the flag, and the reverse must lose
    // it.
    matchDescendants: collectionSlug === 'pages',
    to: {
      type: 'reference' as const,
      reference: { relationTo: collectionSlug, value: doc.id },
    },
    // #178. The served path the target has RIGHT NOW, frozen onto the row.
    // `to` is a reference, so the row's destination follows the document
    // forever — correct for `from` itself and not enough for a URL captured
    // beneath it, whose own row is keyed at a path spelled the way things were
    // at this moment. Written for every row, not only the `matchDescendants`
    // ones that need it: it is the same expression either way, and a row can
    // gain the flag later (a post rename repointed by a page move), at which
    // point a missing snapshot would be a hole nothing could backfill.
    toPathAtCapture: to,
    // #130 added a permanence field to the collection. A rename is by
    // definition a permanent move, so this hook states 301 rather than relying
    // on the field's `defaultValue`: an `update` of an existing row does not
    // re-apply a default, so a row an editor had flipped to temporary would
    // otherwise stay temporary after a later rename repointed it.
    type: '301' as const,
  }

  try {
    const existing = await req.payload.find({
      collection: 'redirects',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      req,
      where: { from: { equals: from } },
    })

    const current = existing.docs[0]
    if (current) {
      await req.payload.update({
        collection: 'redirects',
        data,
        id: current.id,
        overrideAccess: true,
        req,
      })
    } else {
      await req.payload.create({
        collection: 'redirects',
        data,
        overrideAccess: true,
        req,
      })
    }

    req.payload.logger.info(
      `Path changed: redirecting ${from} -> ${to} (${collectionSlug}#${doc.id})`,
    )

    // Contained, not bare (#156). The purge sits inside this `try` on purpose —
    // it must stay conditional on the row having landed (see the docblock's
    // ownership rule) — but that placement is exactly why it cannot be allowed
    // to throw: an uncontained `revalidatePath` failure would be caught below
    // and logged as "Failed to create redirect", which is false, the row is
    // already written, and the operation would then roll it back anyway. The
    // wrap makes the log line honest and the row's survival unconditional.
    if (!context?.disableRevalidate)
      containRevalidation(req.payload, 'redirect row', from, () =>
        revalidatePath(from),
      )
  } catch (error) {
    req.payload.logger.error(
      { err: error },
      `Failed to create redirect ${from} -> ${to}`,
    )
  }

  return doc
}
