import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import { refusePublishUnderUnpublishedParent } from './servedPrefix'

/**
 * Unit coverage for the served-prefix guards (#180).
 *
 * @remarks **What this tier is for, and what it deliberately leaves to the pg
 * tier.** The decisions below are branch decisions the guards make from rows
 * they read, so a stub that answers `find` states the tree as data and lets a
 * case assert on the decision. What a stub cannot show is that the rows are the
 * ones Postgres would actually return through Payload's drafts machinery — that
 * a `draft: true` create really does write a main row, that a draft save really
 * does leave it alone, that `_status` really is queryable in a `where`. Those
 * are the `evals/pages-hierarchy-integration.test.ts` cases, per
 * `docs/TESTING.md` §"Payload pipeline integration".
 *
 * The one thing this tier proves that the pg tier cannot is the **read count**:
 * the acceptance criterion is that a draft save issues no query, and counting
 * calls is how that is stated rather than inferred.
 */

/** A row as the guards read it back through `find`. */
type Row = {
  _status: 'draft' | 'published'
  collection: 'pages' | 'posts'
  id: number
  parent?: number | null
  path?: string | null
  slug?: string
  title?: string
}

/**
 * A `PayloadRequest` stub backed by a row table.
 *
 * @param rows - The tree, stated as data.
 * @returns The stub plus a `calls` array recording every `find` the guards make
 *   — the read-count assertions read it directly.
 *
 * @remarks It implements exactly the three `where` shapes the guards use: by
 * `id`, by `path` `like` + `_status`, and by `parent` + `_status`. `like` is
 * modelled as Payload's real semantics — a CONTAINS, not a prefix — because the
 * guard's JS re-filter exists precisely to survive that, and a stub that
 * modelled `like` as a prefix would make the re-filter untestable.
 */
const stub = (rows: Row[], query?: Record<string, unknown>) => {
  const calls: Array<{ collection: string; where: unknown }> = []

  const matches = (row: Row, where: Record<string, unknown>): boolean => {
    const clauses = Array.isArray(where.and)
      ? (where.and as Array<Record<string, Record<string, unknown>>>)
      : [where as Record<string, Record<string, unknown>>]
    return clauses.every((clause) => {
      if (clause.id) return String(row.id) === String(clause.id.equals)
      if (clause._status) return row._status === clause._status.equals
      if (clause.parent)
        return (
          row.parent !== null &&
          row.parent !== undefined &&
          String(row.parent) === String(clause.parent.equals)
        )
      if (clause.path?.like !== undefined)
        // Payload's `like` is `ILIKE '%value%'` — a contains.
        return (row.path ?? '').includes(String(clause.path.like))
      return true
    })
  }

  const req = {
    ...(query === undefined ? {} : { query }),
    payload: {
      find: async ({
        collection,
        where,
      }: {
        collection: 'pages' | 'posts'
        where: Record<string, unknown>
      }) => {
        calls.push({ collection, where })
        return {
          docs: rows.filter(
            (row) => row.collection === collection && matches(row, where),
          ),
        }
      },
    },
  } as unknown as PayloadRequest

  return { calls, req }
}

/** Hook args shaped like Payload's, carrying only what the guards read. */
const args = (
  req: PayloadRequest,
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
  operation: 'create' | 'update' = 'update',
) =>
  ({
    collection: { slug: 'pages' },
    context: {},
    data,
    operation,
    originalDoc,
    req,
  }) as never

/**
 * The per-field message a `ValidationError` carries, which is what the admin
 * renders on the field.
 *
 * @param run - The rejecting call.
 * @returns `{ summary, fields }` — the error's own `message` (Payload's
 *   composed "The following field is invalid: Parent", which becomes a toast)
 *   and the `data.errors` entries (which `ADD_SERVER_ERRORS` writes onto field
 *   state).
 *
 * @remarks Split out because the distinction is the whole point of targeting
 * `parent`: the guard's sentence is NOT the error's `message`. Payload's
 * `ValidationError` constructor composes that from the field LABELS
 * (`payload/dist/errors/ValidationError.js`), so a test that asserts the
 * sentence against `.toThrow()` is asserting against the summary and would pass
 * or fail for the wrong reason.
 */
const rejection = async (run: Promise<unknown>) => {
  const error = (await run.catch((thrown: unknown) => thrown)) as {
    data?: {
      errors?: Array<{ label?: string; message?: string; path?: string }>
    }
    message?: string
  }
  return { fields: error.data?.errors ?? [], summary: error.message ?? '' }
}

describe('refusePublishUnderUnpublishedParent (#180)', () => {
  it('refuses a publish under a DRAFT parent, naming the parent', async () => {
    const { req } = stub([
      {
        _status: 'draft',
        collection: 'pages',
        id: 1,
        path: 'work',
        slug: 'work',
        title: 'Work',
      },
    ])

    const { fields, summary } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 1, slug: 'brytecore' }),
      ) as Promise<unknown>,
    )
    expect(fields[0]?.message).toMatch(/“Work” is not published/)
    // And the toast the editor also gets is Payload's own summary, composed
    // from the LABEL — not the sentence above. Pinned so the two are never
    // confused: the sentence only reaches the editor because `parent` renders.
    expect(summary).toBe('The following field is invalid: Parent')
  })

  it('attaches the message to `parent`, the field the editor can change', async () => {
    // `_status` is declared with `admin.components.Field: false`
    // (`payload/dist/versions/baseFields.js`), so a field error dispatched
    // there renders nowhere. This assertion is the pin for that choice.
    const { req } = stub([
      { _status: 'draft', collection: 'pages', id: 1, slug: 'work' },
    ])

    const { fields } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 1, slug: 'brytecore' }),
      ) as Promise<unknown>,
    )

    expect(fields).toEqual([
      expect.objectContaining({ label: 'Parent', path: 'parent' }),
    ])
  })

  it('falls back to the parent’s slug when it has no title yet', async () => {
    const { req } = stub([
      { _status: 'draft', collection: 'pages', id: 1, slug: 'work' },
    ])

    const { fields } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 1 }),
      ) as Promise<unknown>,
    )
    expect(fields[0]?.message).toMatch(/“work” is not published/)
  })

  it('allows a publish under a PUBLISHED parent', async () => {
    const { req } = stub([
      { _status: 'published', collection: 'pages', id: 1, slug: 'work' },
    ])

    await expect(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 1, slug: 'brytecore' }),
      ),
    ).resolves.toBeTruthy()
  })

  it('reads the parent through the stored placement when the PATCH omits it', async () => {
    // The `originalDoc` merge (`placementOf`): a publish that sends only
    // `_status` still sits under the stored parent.
    const { req, calls } = stub([
      { _status: 'draft', collection: 'pages', id: 1, slug: 'work' },
    ])

    const { fields } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published' }, { id: 2, parent: 1, slug: 'b' }),
      ) as Promise<unknown>,
    )
    expect(fields[0]?.message).toMatch(/not published/)
    expect(calls).toHaveLength(1)
  })

  it('issues NO query for a top-level publish', async () => {
    const { req, calls } = stub([])

    await refusePublishUnderUnpublishedParent(
      args(req, { _status: 'published', parent: null, slug: 'about' }),
    )
    expect(calls).toEqual([])
  })

  it('issues NO query on a draft save — the 100ms autosave path', async () => {
    const { req, calls } = stub([
      { _status: 'draft', collection: 'pages', id: 1, slug: 'work' },
    ])

    await refusePublishUnderUnpublishedParent(
      args(req, { _status: 'draft', parent: 1, slug: 'brytecore' }),
    )
    expect(calls).toEqual([])
  })

  it('leaves a dangling parent to `parentPathPrefix` rather than reporting it twice', async () => {
    const { req } = stub([])

    await expect(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 99 }),
      ),
    ).resolves.toBeTruthy()
  })
})
