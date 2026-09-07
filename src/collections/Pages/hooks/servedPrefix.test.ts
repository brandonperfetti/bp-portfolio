import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  refusePublishUnderUnpublishedParent,
  refuseUnpublishWithServedDescendants,
} from './servedPrefix'

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

  // The shape standards review reasoned was a hole (S1): re-parenting an
  // ALREADY-PUBLISHED page onto a draft parent, with the caller sending no
  // `_status`. It is not one, and the reason is upstream of the hook — Payload's
  // `beforeValidate` FIELD pass merges the original document into `data` before
  // any collection `beforeChange` hook runs
  // (`payload/dist/fields/hooks/beforeValidate/index.js`, "Merge original
  // document data into incoming data"; ordered at
  // `collections/operations/utilities/update.js:90` then `:125`), so the write
  // arrives carrying the row's own `_status: 'published'`. These two cases pin
  // the DECISION on that shape; `evals/pages-hierarchy-integration.test.ts` pins
  // that the shape is what the pipeline actually produces, which is the half a
  // stub cannot honestly assert about itself.
  it('refuses a re-parent of an ALREADY-PUBLISHED page onto a DRAFT parent', async () => {
    const { req } = stub([
      {
        _status: 'draft',
        collection: 'pages',
        id: 1,
        path: 'lab',
        slug: 'lab',
        title: 'Lab',
      },
    ])

    const { fields } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(
          req,
          // As the merge delivers it: the mover's own `parent`, over the row's
          // current status.
          { _status: 'published', parent: 1, slug: 'brytecore' },
          { _status: 'published', id: 2, parent: 7, slug: 'brytecore' },
        ),
      ) as Promise<unknown>,
    )
    expect(fields).toEqual([
      expect.objectContaining({ label: 'Parent', path: 'parent' }),
    ])
    expect(fields[0]?.message).toMatch(/“Lab” is not published/)
  })

  it('allows a re-parent of an already-published page onto a PUBLISHED parent', async () => {
    const { req } = stub([
      { _status: 'published', collection: 'pages', id: 1, slug: 'work' },
    ])

    await expect(
      refusePublishUnderUnpublishedParent(
        args(
          req,
          { _status: 'published', parent: 1, slug: 'brytecore' },
          { _status: 'published', id: 2, parent: 7, slug: 'brytecore' },
        ),
      ),
    ).resolves.toBeTruthy()
  })

  it('allows re-parenting a DRAFT page onto a draft parent, query-free', async () => {
    // The whole point of enforcing at the transition and not at the placement
    // (#137): a section is drafted top-down, and moving a draft around inside
    // it changes nothing the site serves.
    const { req, calls } = stub([
      { _status: 'draft', collection: 'pages', id: 1, slug: 'lab' },
    ])

    await expect(
      refusePublishUnderUnpublishedParent(
        args(
          req,
          { _status: 'draft', parent: 1, slug: 'brytecore' },
          { _status: 'draft', id: 2, parent: 7, slug: 'brytecore' },
        ),
      ),
    ).resolves.toBeTruthy()
    expect(calls).toEqual([])
  })
})

describe('refuseUnpublishWithServedDescendants (#180)', () => {
  /** A published section page with a published child page beneath it. */
  const servedSubtree = (): Row[] => [
    {
      _status: 'published',
      collection: 'pages',
      id: 1,
      path: 'work',
      slug: 'work',
      title: 'Work',
    },
    {
      _status: 'published',
      collection: 'pages',
      id: 2,
      parent: 1,
      path: 'work/brytecore',
      slug: 'brytecore',
      title: 'Brytecore',
    },
  ]

  it('refuses an unpublish while a published child PAGE sits beneath it', async () => {
    const { req } = stub(servedSubtree())

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow(/Unpublish the page “Brytecore” \(\/work\/brytecore\)/)
  })

  it('refuses an unpublish while a published placed POST sits beneath it', async () => {
    const { req } = stub([
      servedSubtree()[0],
      {
        _status: 'published',
        collection: 'posts',
        id: 7,
        parent: 1,
        path: 'work/hello',
        slug: 'hello',
        title: 'Hello',
      },
    ])

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow(/Unpublish the article “Hello” \(\/work\/hello\)/)
  })

  it('names the SHALLOWEST blocker and counts the rest', async () => {
    const { req } = stub([
      ...servedSubtree(),
      {
        _status: 'published',
        collection: 'pages',
        id: 3,
        parent: 2,
        path: 'work/brytecore/deep',
        slug: 'deep',
        title: 'Deep',
      },
    ])

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow(/“Brytecore”.*and 1 more below this page/)
  })

  it('allows an unpublish once every descendant is a draft', async () => {
    const rows = servedSubtree()
    rows[1]._status = 'draft'
    const { req } = stub(rows)

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).resolves.toBeTruthy()
  })

  it('allows a LEAF unpublish — #155 unchanged', async () => {
    const { req } = stub([servedSubtree()[1]])

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 2 }),
      ),
    ).resolves.toBeTruthy()
  })

  it('does not mistake a path that merely CONTAINS the prefix for a descendant', async () => {
    // Payload's `like` is a contains, so the read returns `homework/deep`; the
    // guard's JS re-filter is what keeps it from refusing.
    const { req } = stub([
      servedSubtree()[0],
      {
        _status: 'published',
        collection: 'pages',
        id: 9,
        path: 'homework/deep',
        slug: 'deep',
        title: 'Homework detail',
      },
    ])

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).resolves.toBeTruthy()
  })

  it('reads the SITE ROOT’s children by `parent`, never by a `home/` prefix', async () => {
    // The root contributes no segment, so its children are stored at `<child>`
    // and `path LIKE 'home/%'` matches nothing. A prefix read here would let
    // the root be unpublished out from under the whole site.
    const { req, calls } = stub([
      {
        _status: 'published',
        collection: 'pages',
        id: 1,
        path: 'home',
        slug: 'home',
        title: 'Home',
      },
      {
        _status: 'published',
        collection: 'pages',
        id: 2,
        parent: 1,
        path: 'about',
        slug: 'about',
        title: 'About',
      },
    ])

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow(/“About”/)

    const subtreeReads = calls.filter((call) =>
      JSON.stringify(call.where).includes('like'),
    )
    expect(subtreeReads).toEqual([])
  })

  it('issues NO query for a publish', async () => {
    const { req, calls } = stub(servedSubtree())

    await refuseUnpublishWithServedDescendants(
      args(req, { _status: 'published' }, { id: 1 }),
    )
    expect(calls).toEqual([])
  })

  it('issues NO query on an admin autosave', async () => {
    const { req, calls } = stub(servedSubtree(), {
      autosave: 'true',
      draft: 'true',
    })

    await refuseUnpublishWithServedDescendants(
      args(req, { _status: 'draft' }, { id: 1 }),
    )
    expect(calls).toEqual([])
  })

  it('stops after ONE read when the page is not currently served', async () => {
    const rows = servedSubtree()
    rows[0]._status = 'draft'
    const { req, calls } = stub(rows)

    await refuseUnpublishWithServedDescendants(
      args(req, { _status: 'draft' }, { id: 1 }),
    )
    expect(calls).toHaveLength(1)
  })

  it('ignores a create', async () => {
    const { req, calls } = stub(servedSubtree())

    await refuseUnpublishWithServedDescendants(
      args(req, { _status: 'draft' }, { id: 1 }, 'create'),
    )
    expect(calls).toEqual([])
  })

  /**
   * The residual, pinned in BOTH directions (#180 follow-up).
   *
   * @remarks `createLocalReq` does not mirror the Local API's `draft` option
   * into `req.query` (`payload/dist/utilities/createLocalReq.js:102`), while
   * `updateDocument` DOES set `data._status = 'draft'` for such a call
   * (`collections/operations/utilities/update.js:29-33`). So a Local-API draft
   * save on a served page with served descendants is refused although it would
   * have unpublished nothing. That is a false refusal, not a wasted lookup, and
   * it is why the escape hatch is pinned beside it.
   */
  it('FALSELY refuses a Local-API explicit draft save (documented residual)', async () => {
    const { req } = stub(servedSubtree())

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow(/still has published documents under it/)
  })

  it('takes the documented escape hatch: `req: { query: { draft: "true" } }`', async () => {
    const { req, calls } = stub(servedSubtree(), { draft: 'true' })

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).resolves.toBeTruthy()
    expect(calls).toEqual([])
  })

  it('does not read `req.query` on a publish, so no request shape can force one through', async () => {
    // The publish guard is query-free by construction; this pins that the
    // unpublish guard's query read cannot be turned into a publish bypass —
    // `data._status === 'published'` loses to nothing.
    const { req } = stub(
      [{ _status: 'draft', collection: 'pages', id: 1, slug: 'work' }],
      { draft: 'true' },
    )

    const { fields } = await rejection(
      refusePublishUnderUnpublishedParent(
        args(req, { _status: 'published', parent: 1 }),
      ) as Promise<unknown>,
    )
    expect(fields[0]?.message).toMatch(/not published/)
  })
})

describe('the guards do not share hidden state', () => {
  it('never issues a write of its own — a refusal is a refusal, not a cascade', async () => {
    // Brandon's decision on #180: the unpublish mirror REFUSES rather than
    // cascade-unpublishing the subtree, so no bulk write can hide behind an
    // editor's single gesture. The stub exposes only `find`; any `update` the
    // guards attempted would throw here rather than pass silently.
    const { req } = stub([
      {
        _status: 'published',
        collection: 'pages',
        id: 1,
        path: 'work',
        slug: 'work',
      },
      {
        _status: 'published',
        collection: 'pages',
        id: 2,
        parent: 1,
        path: 'work/child',
        slug: 'child',
      },
    ])
    const update = vi.fn()
    ;(req.payload as unknown as { update: unknown }).update = update

    await expect(
      refuseUnpublishWithServedDescendants(
        args(req, { _status: 'draft' }, { id: 1 }),
      ),
    ).rejects.toThrow()
    expect(update).not.toHaveBeenCalled()
  })
})
