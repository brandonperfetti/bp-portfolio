import { sql } from '@payloadcms/db-postgres'

import {
  type CorvusChunk,
  type CorvusCollectionSlug,
  chunkDocument,
  isEmbeddable,
} from '@/lib/ai/chunking'
import {
  EMBEDDING_TIMEOUT_MS,
  embedChunks,
  getEmbeddingModelId,
  toVectorLiteral,
} from '@/lib/ai/embeddings'

/**
 * The one capability this module needs from Payload's database adapter.
 *
 * @remarks Narrowed to `execute` on purpose. The write path takes
 * `payload.db.drizzle` — Payload's OWN pool, so there is no second pool under
 * Supavisor and no new dependency — but depending on the full adapter type
 * would make every test drag a Payload instance in. One method is the entire
 * seam.
 */
export interface CorvusEmbeddingsDb {
  execute: (query: unknown) => Promise<unknown>
}

/** What one refresh did, for logging and for the backfill's summary. */
export interface SyncResult {
  /** Chunks written (inserted or updated) after an embedding call. */
  written: number
  /** Rows deleted — stale trailing chunks, or the whole doc when ineligible. */
  deleted: number
  /**
   * Rows whose `visibility` / `published_at` were corrected WITHOUT re-embedding.
   *
   * @remarks Non-zero means the document's body was untouched but its gating or
   * schedule changed — see {@link syncDocumentEmbeddings} for why that is its
   * own path and not a skip.
   */
  metadataUpdated: number
  /** True when content AND retrieval-filter metadata already matched: no writes at all. */
  skipped: boolean
}

/** The per-row state retrieval filters on, as currently stored. */
export interface StoredChunkMeta {
  contentHash: string
  visibility: string
  /** Epoch milliseconds, or `null` for a row with no schedule. */
  publishedAt: number | null
}

const rowsOf = (result: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : []
}

/**
 * Normalize a timestamp to epoch milliseconds for comparison.
 *
 * @remarks The two sides arrive in different shapes: node-postgres parses a
 * `timestamptz` column into a `Date`, while a freshly chunked document carries
 * Payload's ISO string. Comparing them as strings would report drift on every
 * single save and re-write every row forever.
 *
 * @param value - A `Date`, an ISO string, or nullish.
 * @returns Epoch milliseconds, or `null` when absent or unparseable.
 */
export function toEpoch(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const time =
    value instanceof Date ? value.getTime() : new Date(String(value)).getTime()
  return Number.isFinite(time) ? time : null
}

/**
 * The stored content hash AND retrieval-filter metadata, per chunk index.
 *
 * @remarks `visibility` and `published_at` are read alongside `content_hash`
 * because they are DENORMALIZED copies of the source document's gating and
 * schedule. A copy can go stale, and these two going stale is a security
 * problem rather than a freshness one — so the refresh path has to be able to
 * see them, not just the hash.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param docId - Document id.
 * @returns Map of `chunk_index` to its stored hash, visibility and schedule.
 */
export async function readStoredChunks(
  db: CorvusEmbeddingsDb,
  collection: string,
  docId: number,
): Promise<Map<number, StoredChunkMeta>> {
  const result = await db.execute(sql`
    SELECT "chunk_index", "content_hash", "visibility", "published_at", "model"
    FROM "corvus_embeddings"
    WHERE "collection" = ${collection} AND "doc_id" = ${docId}
  `)

  const model = getEmbeddingModelId()
  const stored = new Map<number, StoredChunkMeta>()
  for (const row of rowsOf(result)) {
    // A row written by a DIFFERENT embedding model is treated as absent, so a
    // model swap re-embeds instead of leaving two vector spaces mixed in one
    // index — which would degrade silently rather than fail.
    if (String(row.model) !== model) continue
    stored.set(Number(row.chunk_index), {
      contentHash: String(row.content_hash),
      visibility: String(row.visibility),
      publishedAt: toEpoch(row.published_at),
    })
  }
  return stored
}

/**
 * Does the index already hold exactly this document's body?
 *
 * @remarks This is the check that makes hook-driven refresh cheap enough to run
 * on every save (research §3.7, non-negotiable 3): it runs BEFORE any provider
 * call, so an edit that leaves the body alone — a re-tag, a re-slug, an SEO
 * tweak — spends nothing. Chunk COUNT is compared too, not just the hashes
 * present, so a shortened article does not leave orphaned trailing chunks.
 *
 * It deliberately says nothing about `visibility` or `published_at`; those are
 * {@link hasMetadataDrift}'s job. Folding them into the content hash would be
 * the wrong fix twice over: a pure gating flip would pay for a re-embed it does
 * not need, and every row already in the index would have its hash invalidated
 * on upgrade, forcing a full re-embed of the corpus.
 *
 * @param chunks - Freshly computed chunks.
 * @param stored - Map from {@link readStoredChunks}.
 * @returns `true` when nothing needs re-embedding.
 */
export function isContentUnchanged(
  chunks: CorvusChunk[],
  stored: Map<number, StoredChunkMeta>,
): boolean {
  if (stored.size !== chunks.length) return false
  return chunks.every(
    (chunk) => stored.get(chunk.chunkIndex)?.contentHash === chunk.contentHash,
  )
}

/**
 * Has the document's gating or schedule drifted from what the rows carry?
 *
 * @remarks This closes a gated-content bypass, and it is worth being explicit
 * about the mechanism because the SQL filter looks correct on its own.
 * Retrieval filters on `corvus_embeddings.visibility` and `published_at`, which
 * are per-row COPIES of the source document. Flipping a published post from
 * public to gated changes no body text, so every chunk hash matches and a
 * hash-only comparison reports "unchanged" — leaving the stored rows saying
 * `visibility = 'public'`. The article is now gated on the site while its full
 * text stays retrievable by anonymous chat turns, indefinitely, until some
 * unrelated body edit or a manual backfill happens to rewrite the rows.
 *
 * `published_at` has the same shape: re-dating a published post into the future
 * hides it on the site but leaves retrieval serving it under the old timestamp.
 *
 * So metadata drift is its own path: detected here, repaired by
 * {@link updateDocumentMetadata} with a plain UPDATE and NO provider call.
 *
 * @param chunks - Freshly computed chunks.
 * @param stored - Map from {@link readStoredChunks}.
 * @returns `true` when any stored row disagrees with the fresh chunks.
 */
export function hasMetadataDrift(
  chunks: CorvusChunk[],
  stored: Map<number, StoredChunkMeta>,
): boolean {
  return chunks.some((chunk) => {
    const row = stored.get(chunk.chunkIndex)
    if (!row) return true
    return (
      row.visibility !== chunk.visibility ||
      row.publishedAt !== toEpoch(chunk.publishedAt)
    )
  })
}

/**
 * Correct a document's stored gating and schedule without re-embedding.
 *
 * @remarks Every chunk of a document shares its parent's `visibility` and
 * `published_at`, so this is one UPDATE over the whole document rather than a
 * per-row write. No vector is touched, so this costs zero provider dollars —
 * which is the point: a public → gated flip must take effect immediately, and
 * making it expensive would be an argument for not doing it.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param docId - Document id.
 * @param visibility - The document's current visibility.
 * @param publishedAt - The document's current publication timestamp, or `null`.
 */
export async function updateDocumentMetadata(
  db: CorvusEmbeddingsDb,
  collection: string,
  docId: number,
  visibility: string,
  publishedAt: string | null,
): Promise<void> {
  await db.execute(sql`
    UPDATE "corvus_embeddings"
    SET "visibility" = ${visibility},
        "published_at" = ${publishedAt}::timestamptz,
        "updated_at" = now()
    WHERE "collection" = ${collection} AND "doc_id" = ${docId}
  `)
}

/**
 * Delete every embedding row for one document.
 *
 * @remarks The repair path for a delete, an unpublish, and a document that
 * shrank below its previous chunk count.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param docId - Document id.
 * @returns Nothing; failures propagate to the caller, which decides.
 */
export async function deleteDocumentEmbeddings(
  db: CorvusEmbeddingsDb,
  collection: string,
  docId: number,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM "corvus_embeddings"
    WHERE "collection" = ${collection} AND "doc_id" = ${docId}
  `)
}

/**
 * Write one chunk, upserting on the migration's unique key.
 *
 * @remarks `ON CONFLICT ("collection", "doc_id", "chunk_index")` is exactly
 * the `UNIQUE` constraint the migration declares as "the upsert key the
 * refresh hooks target" — the two must stay in step. Upserting rather than
 * delete-then-insert means a refresh never leaves the document briefly
 * missing from a concurrent query.
 *
 * @param db - Payload's drizzle instance.
 * @param chunk - The chunk to write.
 * @param embedding - Its vector.
 * @param model - The embedding model id that produced the vector.
 */
export async function upsertChunk(
  db: CorvusEmbeddingsDb,
  chunk: CorvusChunk,
  embedding: readonly number[],
  model: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO "corvus_embeddings"
      ("collection", "doc_id", "chunk_index", "title", "content",
       "content_hash", "source_url", "visibility", "published_at",
       "embedding", "model", "updated_at")
    VALUES
      (${chunk.collection}, ${chunk.docId}, ${chunk.chunkIndex},
       ${chunk.title}, ${chunk.content}, ${chunk.contentHash},
       ${chunk.sourceUrl}, ${chunk.visibility},
       ${chunk.publishedAt}::timestamptz,
       ${toVectorLiteral(embedding)}::vector, ${model}, now())
    ON CONFLICT ("collection", "doc_id", "chunk_index") DO UPDATE SET
      "title" = EXCLUDED."title",
      "content" = EXCLUDED."content",
      "content_hash" = EXCLUDED."content_hash",
      "source_url" = EXCLUDED."source_url",
      "visibility" = EXCLUDED."visibility",
      "published_at" = EXCLUDED."published_at",
      "embedding" = EXCLUDED."embedding",
      "model" = EXCLUDED."model",
      "updated_at" = now()
  `)
}

/**
 * Delete rows above the document's current chunk count.
 *
 * @param db - Payload's drizzle instance.
 * @param collection - Collection slug.
 * @param docId - Document id.
 * @param keepCount - Number of chunks the document now has.
 */
export async function deleteTrailingChunks(
  db: CorvusEmbeddingsDb,
  collection: string,
  docId: number,
  keepCount: number,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM "corvus_embeddings"
    WHERE "collection" = ${collection}
      AND "doc_id" = ${docId}
      AND "chunk_index" >= ${keepCount}
  `)
}

/** Arguments for {@link syncDocumentEmbeddings}. */
export interface SyncDocumentArgs {
  db: CorvusEmbeddingsDb
  collection: CorvusCollectionSlug
  doc: Record<string, unknown>
  /** Bounds the provider call; defaults to {@link EMBEDDING_TIMEOUT_MS}. */
  abortSignal?: AbortSignal
}

/**
 * Bring one document's embedding rows in line with its current content.
 *
 * @remarks The single write path, shared by the refresh hooks and the backfill
 * script so the two can never drift. Order matters and is deliberate:
 *
 * 1. An INELIGIBLE document (an unpublished post) has its rows deleted and
 *    returns immediately — that is what makes unpublishing remove content from
 *    retrieval rather than merely stop updating it.
 * 2. Stored hashes are read and compared BEFORE the provider is called, so the
 *    common no-op save costs one cheap indexed SELECT and zero tokens.
 * 3. If the body is unchanged but `visibility` or `published_at` drifted, the
 *    rows are corrected with a plain UPDATE and STILL no provider call. This
 *    branch is a security fix, not an optimization: those two columns are the
 *    ones retrieval filters on, so leaving them stale after a public → gated
 *    flip keeps a now-gated article's full text reachable by anonymous chat
 *    turns. See {@link hasMetadataDrift}.
 * 4. Only then is the batch embedded, bounded by an abort signal.
 * 5. Trailing rows are deleted last, once the new rows are safely written.
 *
 * This function may throw — a provider outage, a dimension mismatch, a
 * database error. The HOOK is what must never throw; keeping that decision at
 * the call site means the backfill script can fail loudly and be re-run, which
 * is exactly what a repair tool should do.
 *
 * @param args - Database handle, collection, document, optional abort signal.
 * @returns A {@link SyncResult} describing what changed.
 */
export async function syncDocumentEmbeddings(
  args: SyncDocumentArgs,
): Promise<SyncResult> {
  const { db, collection, doc } = args
  const docId = Number(doc.id)

  if (!Number.isFinite(docId)) {
    throw new Error(
      `[corvus] cannot sync ${collection}: document has no numeric id`,
    )
  }

  if (!isEmbeddable(collection, doc)) {
    await deleteDocumentEmbeddings(db, collection, docId)
    return { written: 0, deleted: 1, metadataUpdated: 0, skipped: false }
  }

  const chunks = chunkDocument(collection, doc)
  if (!chunks.length) {
    await deleteDocumentEmbeddings(db, collection, docId)
    return { written: 0, deleted: 1, metadataUpdated: 0, skipped: false }
  }

  const stored = await readStoredChunks(db, collection, docId)
  if (isContentUnchanged(chunks, stored)) {
    // The body is identical, so nothing here may call the provider. But the
    // gating/schedule columns retrieval filters on are per-row copies, and a
    // stale copy of `visibility` is a gated-content bypass — so correct them
    // with a plain UPDATE before returning.
    if (!hasMetadataDrift(chunks, stored)) {
      return { written: 0, deleted: 0, metadataUpdated: 0, skipped: true }
    }

    await updateDocumentMetadata(
      db,
      collection,
      docId,
      chunks[0].visibility,
      chunks[0].publishedAt,
    )
    return {
      written: 0,
      deleted: 0,
      metadataUpdated: chunks.length,
      skipped: false,
    }
  }

  const model = getEmbeddingModelId()
  const embeddings = await embedChunks(
    chunks.map((chunk) => chunk.content),
    {
      abortSignal:
        args.abortSignal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    },
  )

  for (const [index, chunk] of chunks.entries()) {
    await upsertChunk(db, chunk, embeddings[index], model)
  }
  await deleteTrailingChunks(db, collection, docId, chunks.length)

  return {
    written: chunks.length,
    deleted: 0,
    metadataUpdated: 0,
    skipped: false,
  }
}
