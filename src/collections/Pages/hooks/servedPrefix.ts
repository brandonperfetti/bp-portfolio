import { ValidationError } from 'payload'
import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'

import { placementOf } from '@/fields/slug/documentPath'
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
 * **The NARROW rule** (Brandon, #180): the parent, not the whole ancestor
 * chain. The guard below checks the immediate parent's main-table `_status` and
 * nothing above it. Inductively that is the full invariant — a published parent
 * had to pass this same guard against ITS parent — and the narrow form is what
 * keeps the publish path to a single indexed read instead of a depth-3 ancestor
 * walk.
 *
 * **The unpublish mirror is the other half of the invariant** and is not here
 * yet: nothing above stops an editor unpublishing `work` while
 * `work/brytecore` is still served, which reopens the same hole from the other
 * end. It lands in the next commit, as a refusal rather than a
 * cascade-unpublish.
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
 * The main table is the right table to ask: "is the parent's URL live?" is
 * exactly "is the parent's main row published?" — a parent with a published row
 * and a newer unpublished draft is still being served, and the `_v` table would
 * answer about the draft instead.
 *
 * This is a local read rather than a call into `findMainTableRow` because that
 * function's projection is `{ path, slug }` — it exists to name a URL, and
 * widening it to carry `_status` and `title` for this guard would make every
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
    select: { _status: true, path: true, slug: true, title: true },
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
