import type { FieldHook } from 'payload'

import { findPublishedSlug } from './findPublishedSlug'
import { isSlugRoutedCollection } from './slugPaths'

/**
 * `beforeValidate` field hook that freezes a published document's slug: once a
 * document has a live URL, the slug can only change when the editor has
 * explicitly unlocked it (`slugLock: false`).
 *
 * @remarks **Why a server hook (#120).** The reported bug is a client-side
 * autofill: `SlugComponent` re-derives the slug from the title on every
 * keystroke while `slugLock` is truthy, so an innocent title edit on a
 * published post silently moved `/articles/<old>` and 404'd every inbound
 * link. Fixing only the admin component would leave the URL contract enforced
 * by a convenience layer — the repo's standing rule is the opposite (see
 * `.github/copilot-instructions.md`: gating is server-side, UI is never the
 * enforcement point). This hook is that enforcement point, so a REST `PATCH`,
 * an MCP `updatePosts` call, and the admin form are all held to the same rule.
 *
 * **Why no data migration.** `slugLock` is stored `true` on every migrated and
 * seeded document (`scripts/migrate-notion-to-payload.ts`,
 * `seed-cms-from-notion.ts`, `seed-e2e.ts`). Rather than flipping those values,
 * the *meaning* of the stored `true` is narrowed: `slugLock: true` now reads
 * "I do not hand-edit this slug", which resolves to *derived from the title*
 * before first publish and *frozen at the published value* afterwards. Every
 * existing published document is therefore frozen by rule on day one, with no
 * migration and no schema change.
 *
 * **Scope.** Only drafts-enabled collections are considered, because "has been
 * published" is the whole premise. Posts and Pages are the only slug-routed
 * collections (`slugPaths.ts`); Categories/Tags/Projects/Authors keep today's
 * derive-from-title behaviour untouched.
 *
 * **Cost.** The common paths cost nothing: an unchanged slug and an
 * `originalDoc` that is already the published row both return without a query.
 * The extra `find` runs only when a locked, existing, drafts-enabled document's
 * slug is actually moving — and it is a single indexed, `depth: 0`,
 * `select: { slug: true }` lookup on the same request transaction.
 */
export const enforceSlugFreeze =
  (): FieldHook =>
  async ({
    collection,
    data,
    operation,
    originalDoc,
    req,
    siblingData,
    value,
  }) => {
    // A brand-new document has no public URL to protect.
    if (operation !== 'update') return value
    // No drafts => no publish concept => nothing this hook can reason about.
    if (!collection?.versions?.drafts) return value
    // No public URL behind the slug => nothing to freeze. `slugPaths.ts` is the
    // single place that decides this, so adding a slug-routed collection there
    // extends the freeze to it automatically.
    if (!isSlugRoutedCollection(collection.slug)) return value

    // An explicit unlock is the ONE way a published URL is allowed to move.
    // Falling back to the stored value matters: a REST/MCP payload that sends a
    // new `slug` but omits `slugLock` must still be frozen, not treated as an
    // unlock by omission.
    const lock =
      siblingData?.slugLock ?? data?.slugLock ?? originalDoc?.slugLock
    if (lock === false) return value

    const stored = originalDoc?.slug
    if (typeof stored !== 'string' || stored.length === 0) return value
    if (value === stored) return value

    // Fast path: `originalDoc` is already the published row, so it *is* the
    // live URL — no lookup needed. This covers the exact admin path #120
    // measured (edit the title of a published post, save).
    if (originalDoc?._status === 'published') return stored

    // `originalDoc` is a draft. It may still be the draft of a document with a
    // live published version (autosave), so ask the database before allowing
    // the move. A never-published draft falls through and keeps deriving from
    // its title, which is the useful pre-publish behaviour.
    const id = originalDoc?.id
    if (id === undefined || id === null) return value

    const publishedSlug = await findPublishedSlug(req, collection.slug, id)
    return publishedSlug ?? value
  }
