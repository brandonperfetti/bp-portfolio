import { APIError, ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import {
  type PlaceableDoc,
  parentIdOf,
  placementOf,
} from '@/fields/slug/documentPath'
import { hasDraftSaveIntent } from '@/hooks/draftSaveIntent'
import { ROOT_PAGE_SLUG, publicPathFor } from '@/fields/slug/slugPaths'
import type { Page } from '@/payload-types'

/**
 * The served-prefix invariant for Pages (#180): **every served page's ancestors
 * are served too.**
 *
 * @remarks **Why this is a publish-time rule and not a placement rule.** Posts
 * express the same idea declaratively — `parent` carries
 * `filterOptions: () => ({ _status: { equals: 'published' }, … })`
 * (`src/collections/Posts/index.ts`), which Payload enforces as a field
 * validation on every write, not merely as an admin picker filter. Pages cannot
 * copy that. A section is legitimately drafted whole and published top-down
 * (#137): `work`, `work/brytecore` and `work/acme` are created together while
 * none of them is live, and a write-time rule would refuse the second document
 * before the first had shipped. What is illegitimate is not the *placement*, it
 * is the *publish* — so the block goes at the moment a URL becomes reachable.
 *
 * **What the invariant buys, beyond tidiness.** A published page under a draft
 * parent is the one way a served URL sits under an unserved prefix, and it is
 * the source of the cascade residual `docs/PAYLOAD.md` used to record: a
 * published child of a never-published parent moves on the parent's FIRST
 * publish with no redirect row, because the D4 `matchDescendants` row is keyed
 * on the parent's own served path and the parent never had one. Refusing that
 * state at publish removes the residual rather than documenting it — every
 * subtree move now has a served prefix to key its row on.
 *
 * **Two guards, and the second one REFUSES rather than cascading** (Brandon,
 * #180). The mirror of "you may not publish under a draft parent" is "you may
 * not unpublish out from under a served descendant", and the tempting
 * alternative — unpublish the subtree for the editor — was rejected: an
 * unpublish that silently takes N other documents off the site is a bulk write
 * nobody asked for and nobody sees, and it is not reversible by the same
 * gesture (re-publishing the parent does not re-publish what was swept). A
 * refusal names what is in the way and leaves the editor holding the decision.
 * Symmetry is the other half: one rule the editor learns once, enforced at both
 * ends.
 *
 * **The NARROW rule** (Brandon, #180): the parent, not the whole ancestor
 * chain. Guard 1 checks the immediate parent's main-table `_status`; guard 2
 * checks descendants of the page's own served path. Inductively those two
 * compose into the full invariant — a published parent had to pass guard 1
 * against ITS parent — and the narrow form is what keeps the publish path to a
 * single indexed read instead of a depth-3 ancestor walk.
 */

/**
 * A page or post reduced to what the two guards ask of it.
 *
 * @remarks Every member is optional because these are `select`ed projections,
 * not documents, and `unknown` because a `select` result is typed loosely.
 */
type GuardRow = {
  _status?: unknown
  id?: unknown
  parent?: unknown
  path?: unknown
  slug?: unknown
  title?: unknown
}

/**
 * Read one page's MAIN-TABLE row — the row the site is serving from.
 *
 * @param req - The in-flight request, so the read joins the write's
 *   transaction.
 * @param id - The page id.
 * @returns The projection, or `null` when the id does not resolve.
 *
 * @remarks **`payload.find` with no `draft` flag reads the main table, and that
 * is the documented switch rather than an accident of the call site.**
 * `[read-from-source, payload 3.88.0, collections/operations/find.js:103]` the
 * operation calls `payload.db.queryDrafts` (the `_v` versions table) only when
 * `hasDraftsEnabled(collectionConfig) && draftsEnabled`; with `draft` omitted it
 * falls to the `else` at :129 and calls `payload.db.find`. Same fact
 * `findMainTableRow` (`src/fields/slug/findPublishedSlug.ts`) rests on.
 *
 * The main table is the right table for both guards. Guard 1 asks "is the
 * parent's URL live?", which is exactly "is the main row published?" — a
 * parent with a published row and a newer unpublished draft is still being
 * served. Guard 2 asks "what prefix are this page's descendants stored under?",
 * and a draft save never writes the main row
 * (`collections/operations/utilities/update.js:253`), so the main row is by
 * construction the value every descendant's `path` was composed from.
 *
 * This is a local read rather than a call into `findMainTableRow` because that
 * function's projection is `{ path, slug }` — it exists to name a URL, and
 * widening it to carry `_status` and `title` for these guards would make every
 * one of its four callers pay for columns they do not read.
 */
const readPageMainRow = async (
  req: PayloadRequest,
  id: number | string,
): Promise<GuardRow | null> => {
  const { docs } = await req.payload.find({
    collection: 'pages',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    select: {
      _status: true,
      parent: true,
      path: true,
      slug: true,
      title: true,
    },
    where: { id: { equals: id } },
  })
  return (docs[0] as GuardRow | undefined) ?? null
}

/**
 * The name to put in front of an editor for a page they cannot see the row of.
 *
 * @param row - A page/post projection carrying `title` and/or `slug`.
 * @returns The title, else the slug, else a literal fallback.
 *
 * @remarks Title first because that is what the admin list shows
 * (`useAsTitle: 'title'` on both collections); slug second because a document
 * mid-create can carry one without the other.
 */
const labelFor = (row: GuardRow | null | undefined): string => {
  if (typeof row?.title === 'string' && row.title.length > 0) return row.title
  if (typeof row?.slug === 'string' && row.slug.length > 0) return row.slug
  return 'that page'
}

/**
 * Is the write in flight an admin or REST **draft save**, an autosave or an
 * explicit "Save draft", rather than a publish or an unpublish?
 *
 * @param req - The in-flight request.
 * @param data - The incoming payload, for the `_status` clause Payload itself
 *   applies.
 * @returns `true` when the query string says the write is a draft save.
 *
 * @remarks `req.query.draft` / `req.query.autosave` is how the admin and REST
 * say it, and how a Local-API caller can say it by hand
 * (`req: { query: { draft: 'true' } }`). A plain Local-API
 * `payload.update({ draft: true })` does not reach `req.query`; the guard below
 * reads that call's own `draft` argument separately (#197), because it lets a
 * Local-API draft through only when the draft does not move the page.
 *
 * **A deliberate copy of the predicate in `src/hooks/capturePublishedSlug.ts`**,
 * which stays query-only: the capture rewrites its stash on every other write,
 * so a Local-API draft save the guard lets through never leaves a stale one
 * for the cascade to read (#197 review, R3).
 *
 * An unpublish and an autosave arrive at `beforeChange` with the SAME
 * `data._status: 'draft'`, the same `operation`, and the same `originalDoc`;
 * that file's docblock has the measured evidence. The
 * `data._status === 'published'` test comes first because Payload's own
 * `isSavingDraft` (`collections/operations/utilities/update.js`) ANDs that
 * clause in: a REST `PATCH ?draft=true` carrying `{ _status: 'published' }` is a
 * real publish and writes the main table.
 */
const isDraftSaveRequest = (
  req: PayloadRequest | undefined,
  data: Record<string, unknown> | undefined,
): boolean => {
  if (data?._status === 'published') return false
  const query = req?.query as Record<string, unknown> | undefined
  const flag = query?.draft ?? query?.autosave
  return flag === true || flag === 'true'
}

/**
 * Would this write give the page a different slug or parent from its main row,
 * the row the site serves and its descendants' paths were composed from?
 *
 * @param data - The incoming payload.
 * @param originalDoc - The latest version, draft or not, which Payload hands
 *   `beforeChange`; it supplies whatever `data` leaves out.
 * @param own - The page's main-table row.
 *
 * @remarks Read the way `computePagePath` reads it (`placementOf`), so a field
 * the write leaves out counts at its LATEST value: a title-only draft on top of
 * a pending renamed draft still moves the page, because that draft's path is
 * the one the cascade would compare against the main row.
 */
const movesPage = (
  data: PlaceableDoc | undefined,
  originalDoc: PlaceableDoc | undefined,
  own: GuardRow,
): boolean => {
  const { parentId, slug } = placementOf(data, originalDoc)
  const ownParent = parentIdOf(own.parent)
  return (
    slug !== own.slug ||
    (parentId === null ? null : String(parentId)) !==
      (ownParent === null ? null : String(ownParent))
  )
}

/**
 * `beforeChange` guard: refuse to publish a page whose parent is not published.
 *
 * @remarks **It fires on `data._status` alone, so the 100ms autosave pays
 * nothing.** A draft save carries `_status: 'draft'` and returns on the first
 * line, before any read — and it gets there without consulting `req.query` at
 * all, which is why this guard needs no copy of Payload's request-shape
 * reasoning. A top-level page returns on the second line, also query-free. The
 * one indexed read happens on exactly the transition it describes: publishing a
 * placed page.
 *
 * **`data._status` is not "what the caller sent", and the difference is what
 * closes the re-parent route into the same illegal state** (raised as a hole in
 * standards review, #180 S1; disproved here by measurement). The worry was that
 * moving an ALREADY-PUBLISHED page onto a draft parent with
 * `payload.update({ data: { parent } })` — no `_status`, no `draft` flag —
 * slips past both guards, since this one returns on
 * `data._status !== 'published'` and the mirror on `data._status !== 'draft'`,
 * and `validatePageHierarchy` never looks at a parent's status. It does not
 * slip past, because `data` at this point is not the caller's patch: Payload's
 * `beforeValidate` **field** pass runs first
 * (`collections/operations/utilities/update.js:90`, collection `beforeChange`
 * at `:125`) and one of its four documented jobs is "Merge original document
 * data into incoming data"
 * (`payload/dist/fields/hooks/beforeValidate/index.js`). So on every update —
 * Local API, REST `PATCH`, bulk `where`, all of which reach `updateDocument`
 * through that same line — `data` arrives merged and carries the row's own
 * `_status: 'published'`, and this guard refuses the move. `[measured]` the
 * probe is in `evals/pages-hierarchy-integration.test.ts` ("…even though the
 * write sends no `_status`"), which goes RED with this guard disabled: without
 * it the move is accepted and the page is stored under the unserved prefix.
 *
 * That makes the merge a Payload internal this guard silently depends on, which
 * is why the pg case pins it rather than the unit tier: a stub is handed
 * whatever `data` shape the author believes in, and believing the unmerged
 * shape is exactly how the hole was reasoned into existence. If Payload ever
 * stops merging, the hole is real and that case is what says so.
 *
 * **The error is a `ValidationError` targeting `parent`, and the field is
 * chosen, not incidental.** `[read-from-source, payload 3.88.0]` a thrown
 * `ValidationError` reaches the admin as
 * `{ errors: [{ name, message, data: { errors: [{ path, message }] } }] }`
 * (`utilities/formatErrors.js`), and `@payloadcms/ui`'s `Form` splits that: the
 * outer `message` becomes a toast, and each inner entry carrying a `path` is
 * dispatched as `ADD_SERVER_ERRORS` (`forms/Form/index.js:395-410`), which
 * writes `errorMessage` onto that path's field state
 * (`forms/Form/fieldReducer.js:63-78`) for the field's own component to render.
 * So the sentence below is only shown where a field renders it — and `_status`,
 * the field this rule is really about, is declared with
 * `admin.components.Field: false` (`payload/dist/versions/baseFields.js`) and
 * renders no component at all. Pointed at `_status` this message would be
 * dispatched into form state nothing draws, leaving the editor with the generic
 * "The following field is invalid: Status" toast Payload composes. Pointed at
 * `parent` it lands on the sidebar relationship the editor must actually
 * change.
 *
 * @param args - Payload's `beforeChange` arguments.
 * @returns `data`, unchanged, when the write is allowed.
 * @throws ValidationError naming the unpublished parent, on `parent`.
 */
export const refusePublishUnderUnpublishedParent: CollectionBeforeChangeHook<
  Page
> = async ({ data, originalDoc, req }) => {
  if (data?._status !== 'published') return data

  const { parentId } = placementOf(data, originalDoc)
  if (parentId === null) return data

  const parent = await readPageMainRow(req, parentId)
  // A missing parent is not this guard's error to report: `parentPathPrefix`
  // (`documentPath.ts`) already refuses the write with a message about the
  // dangling relationship, and duplicating that here would mean two different
  // sentences for one condition.
  if (!parent) return data
  if (parent._status === 'published') return data

  const label = labelFor(parent)
  // A `ValidationError`, where the other 12 admin-visible refusals in this tree
  // (`documentPath.ts`, `pageHierarchy.ts`, `postPlacement.ts`, and guard 2
  // below) are all `APIError(msg, 400)`. The exception is deliberate and the
  // reason is in the docblock above: only a `ValidationError` carries a
  // `data.errors[].path` the admin can bind to a FIELD, and `parent` is the one
  // field the editor can act on — `_status`, the field this rule is really
  // about, renders no component at all. Read that argument before "normalizing"
  // this to the house `APIError`.
  throw new ValidationError(
    {
      collection: 'pages',
      errors: [
        {
          label: 'Parent',
          message: `“${label}” is not published, so this page cannot be either — its URL would sit under a path the site does not serve. Publish “${label}” first, or pick a parent that is already published.`,
          path: 'parent',
        },
      ],
      req,
    },
    req?.t,
  )
}

/**
 * Every published Page and placed Post stored beneath `prefix`.
 *
 * @param req - The in-flight request, so the reads join the write's
 *   transaction.
 * @param prefix - The unpublishing page's stored `path`, e.g. `work`.
 * @returns The blockers found, shallowest first, or an empty array.
 *
 * @remarks **A deliberate COPY of `readSubtree`'s query shape
 * (`pageHierarchy.ts`), narrowed to published rows.** That function is
 * module-private and its collection is inside this fence only for
 * registration, so this is a copy with the reason written down rather than a
 * silent second vocabulary: two reads, one per collection, both on the indexed
 * `path` column, neither recursive — a subtree is a string prefix in this
 * schema, which is the whole reason `path` is stored rather than walked.
 *
 * **`like` then a second filter in JS**, for the same measured reason
 * `readSubtree` gives: Payload's `like` compiles to `ILIKE '%value%'`, a
 * *contains* and not a prefix, so `work/` also matches `homework/deep`. The
 * indexed read is still the right read; the exact predicate is re-applied here
 * so the guard cannot refuse an unpublish over a document that merely shares a
 * substring.
 *
 * **The one line of the original this copy does NOT carry is its `id` guard**
 * (`if (typeof doc.id !== 'number' && typeof doc.id !== 'string') continue`),
 * and the absence is deliberate rather than dropped. `readSubtree` exists to
 * hand each row's `id` to `payload.update`, so an unusable `id` makes the row
 * unusable to it. This reader never touches `id` — its blockers become a
 * sentence via {@link labelFor} and `publicPathFor`, from `title`/`slug`/`path`
 * — and it does not even `select` the column, so the same guard here would be
 * an inert line filtering on a field this function never reads.
 *
 * Shallowest first so the message names the topmost blocker — the one the
 * editor has to deal with first — rather than an arbitrary leaf.
 */
const readServedDescendantsByPrefix = async (
  req: PayloadRequest,
  prefix: string,
): Promise<Array<GuardRow & { collection: 'pages' | 'posts' }>> => {
  const found: Array<GuardRow & { collection: 'pages' | 'posts' }> = []

  for (const collection of ['pages', 'posts'] as const) {
    const { docs } = await req.payload.find({
      collection,
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: { _status: true, path: true, slug: true, title: true },
      where: {
        and: [
          { path: { like: `${prefix}/` } },
          { _status: { equals: 'published' } },
        ],
      },
    })
    for (const doc of docs as GuardRow[]) {
      if (typeof doc.path !== 'string') continue
      if (!doc.path.startsWith(`${prefix}/`)) continue
      found.push({ ...doc, collection })
    }
  }

  return found.sort(
    (a, b) =>
      String(a.path).split('/').length - String(b.path).split('/').length,
  )
}

/**
 * Every published Page and placed Post whose `parent` is this page.
 *
 * @param req - The in-flight request.
 * @param id - The unpublishing page's id.
 * @returns The blockers found.
 *
 * @remarks **The site root needs this second query shape, and a prefix read
 * would be silently wrong for it.** The root contributes NO segment to its
 * children — `parentPathPrefix` returns `''` when the parent's path is
 * `ROOT_PAGE_SLUG` (`documentPath.ts`), which is the storage half of the
 * root-page contract: the root serves `/`, so its children serve `/<child>`
 * and are stored at `<child>`, not `home/<child>`. So
 * `path LIKE 'home/%'` matches NOTHING beneath the root, and a guard built on
 * it alone would let the root be unpublished out from under the entire site
 * while reporting no blockers at all.
 *
 * **Depth is covered by guard 1, not by a walk — this branch is the one
 * genuinely shallow read in the change, and here is exactly what it does not
 * see.** It reads the root's DIRECT children only. A published GRANDCHILD under
 * a draft direct child of the root is therefore invisible to it, and
 * unpublishing the root in that state would be allowed. That state is one
 * {@link refusePublishUnderUnpublishedParent} refuses to create — it refuses
 * both the publish of the grandchild under the draft child and the re-parent of
 * an already-published grandchild onto it — so under the invariant a published
 * grandchild implies a published child, which this read finds. It can still
 * pre-exist the guards, or be written around them (direct SQL, a migration,
 * `db.updateOne`), and `scripts/audit-served-prefix.sql` is how such a row is
 * found rather than assumed away. The non-root branch has no such gap:
 * {@link readServedDescendantsByPrefix} is a prefix read and sees the whole
 * subtree at every depth.
 *
 * The posts read is vacuous today — Posts' `parent` carries
 * `filterOptions: … slug: { not_equals: ROOT_PAGE_SLUG }`, so no post can be
 * placed under the root — and it is here anyway, because this guard should not
 * silently depend on another collection's picker rule staying as it is.
 */
const readServedChildrenByParent = async (
  req: PayloadRequest,
  id: number | string,
): Promise<Array<GuardRow & { collection: 'pages' | 'posts' }>> => {
  const found: Array<GuardRow & { collection: 'pages' | 'posts' }> = []

  for (const collection of ['pages', 'posts'] as const) {
    const { docs } = await req.payload.find({
      collection,
      depth: 0,
      limit: 0,
      overrideAccess: true,
      pagination: false,
      req,
      select: { _status: true, path: true, slug: true, title: true },
      where: {
        and: [{ parent: { equals: id } }, { _status: { equals: 'published' } }],
      },
    })
    for (const doc of docs as GuardRow[]) found.push({ ...doc, collection })
  }

  return found
}

/**
 * `beforeChange` guard: refuse to unpublish a page while something beneath it
 * is still served.
 *
 * @remarks **Why an `APIError` and not a `ValidationError`.** The mirror guard
 * has a field to point at; this one does not. The write being refused sets
 * `_status`, and `_status` renders no component
 * (`admin.components.Field: false`, `payload/dist/versions/baseFields.js`), so
 * a field error dispatched there is written into form state nothing draws.
 * `parent` is the wrong field — the editor's parent is not the problem, their
 * children are — and there is no "children" field to target, because the
 * relationship is stored on the child. An `APIError` carries its message to the
 * editor in full: `formatErrors` emits `{ errors: [{ message }] }` for an
 * `APIError` with no `data` (`payload/dist/utilities/formatErrors.js`), and
 * `Form` toasts every entry that has a `message`
 * (`@payloadcms/ui/dist/forms/Form/index.js:391-393, 409-413`). A 400 is
 * `isPublic` by construction (`payload/dist/errors/APIError.js`), so the
 * sentence is not swapped for "Something went wrong."
 *
 * **Cost, and where it is not paid.** The guard returns before any read on a
 * publish (`_status !== 'draft'`) and on an admin draft save or autosave
 * ({@link isDraftSaveRequest}: the admin's own `?draft=true` /
 * `?autosave=true` query string). An unpublish or a Local-API draft save pays
 * one indexed main-row read, and only if that row is actually published does
 * an unpublish, or a Local-API draft that moves the page, pay the two subtree
 * reads.
 *
 * **A Local-API draft save that does not move the page is a draft save (#197,
 * option A, Brandon).** By `beforeChange` it looks exactly like an unpublish
 * (`_status: 'draft'`, empty `req.query`); the operation's own `draft`
 * argument tells them apart, and `recordDraftSaveIntent`
 * (`src/hooks/draftSaveIntent.ts`) carries it here from `beforeOperation`, the
 * one hook handed it. So `payload.update({ draft: true })` that edits the
 * title, layout or SEO of a served page with served descendants saves a draft,
 * while `payload.update({ data: { _status: 'draft' } })` is still an unpublish
 * and is still refused. Skipping the guard on `req.payloadAPI === 'local'` was
 * the rejected alternative: that separates Local from REST, not the two
 * Local-API intents.
 *
 * **A Local-API draft that MOVES such a page is refused** ({@link movesPage}:
 * a slug or parent other than the main row's). The capture and the subtree
 * cascade cannot see the Local-API `draft` flag, so they would treat that draft
 * as a move and rewrite every descendant with no `draft` argument, which loads
 * each one's LATEST version and can publish a child's pending draft. Three
 * review rounds found harm in teaching them the flag (#197); refusing the move
 * here is the narrow claim instead. The admin is unaffected: its draft rename
 * carries `?draft=true`, so the capture stashes nothing and no cascade runs.
 *
 * **A Local-API unpublish refusal says how to save a draft instead.** The
 * admin never reaches this sentence on a draft save, so its wording stays as
 * #180 wrote it; a script or MCP caller that trips it by sending
 * `_status: 'draft'` with no `draft` argument is told that `draft: true` is the
 * draft form.
 *
 * @param args - Payload's `beforeChange` arguments.
 * @returns `data`, unchanged, when the write is allowed.
 * @throws APIError naming the shallowest served descendant.
 */
export const refuseUnpublishWithServedDescendants: CollectionBeforeChangeHook<
  Page
> = async ({ data, operation, originalDoc, req }) => {
  if (operation !== 'update') return data
  if (data?._status !== 'draft') return data
  if (isDraftSaveRequest(req, data)) return data

  const id = originalDoc?.id
  if (id === undefined || id === null) return data
  const localDraft = hasDraftSaveIntent(req, data, 'pages', id)

  const own = await readPageMainRow(req, id)
  // Not currently served => this write takes nothing off the site.
  if (own?._status !== 'published') return data
  const path = typeof own.path === 'string' && own.path ? own.path : null
  if (!path) return data

  // A Local-API draft save that leaves the page where it is takes nothing off
  // the site and moves nothing: let it through (#197).
  if (localDraft && !movesPage(data, originalDoc, own)) return data

  const blockers =
    path === ROOT_PAGE_SLUG
      ? await readServedChildrenByParent(req, id)
      : await readServedDescendantsByPrefix(req, path)

  if (blockers.length === 0) return data

  const first = blockers[0]
  const firstUrl = publicPathFor(first.collection, first)
  const noun = first.collection === 'posts' ? 'article' : 'page'
  const rest =
    blockers.length === 1
      ? ''
      : ` (and ${blockers.length - 1} more below this page)`

  if (localDraft) {
    throw new APIError(
      `“${labelFor(own)}” has published documents under it, so a Local-API draft cannot change its slug or parent: the subtree's paths move only when the move is published. Save the draft without changing slug or parent, or publish the move. The ${noun} “${labelFor(first)}”${firstUrl ? ` (${firstUrl})` : ''}${rest} is served under it.`,
      400,
    )
  }

  const localHint =
    req?.payloadAPI === 'local'
      ? ' (Local API: to save a draft instead, pass `draft: true` to `payload.update`.)'
      : ''

  throw new APIError(
    `“${labelFor(own)}” still has published documents under it, so unpublishing it would leave them served under a URL that no longer resolves. Unpublish the ${noun} “${labelFor(first)}”${firstUrl ? ` (${firstUrl})` : ''}${rest} first, then unpublish this page.${localHint}`,
    400,
  )
}
