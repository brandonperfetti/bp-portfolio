import { sql } from '@payloadcms/db-postgres'

import {
  CORVUS_GITHUB_REPOS_COLLECTION,
  type CorvusChunk,
} from '@/lib/ai/chunking'
import {
  EMBEDDING_TIMEOUT_MS,
  embedChunks,
  getEmbeddingModelId,
} from '@/lib/ai/embeddings'
import {
  type CorvusEmbeddingsDb,
  type SyncResult,
  deleteDocumentEmbeddings,
  deleteTrailingChunks,
  hasMetadataDrift,
  isContentUnchanged,
  readStoredChunks,
  updateDocumentMetadata,
  upsertChunk,
} from '@/lib/ai/embeddingsStore'
import { type GithubRepoSource, chunkGithubRepo } from '@/lib/ai/githubRepos'

/**
 * The write path for the `github-repos` collection (#147).
 *
 * @remarks Every SQL statement here comes out of `embeddingsStore.ts` — the
 * same `readStoredChunks`, the same `upsertChunk` against the same
 * `ON CONFLICT (collection, doc_id, chunk_index)` key, the same
 * `deleteTrailingChunks`. Nothing about how a row is written is re-decided.
 *
 * ## Why this is not just `syncDocumentEmbeddings`
 *
 * That function is the single write path for CMS documents, and its first two
 * steps are an `isEmbeddable` check and a `chunkDocument` call — both of which
 * take a Payload document and a CMS collection slug. A repository is neither.
 * Widening those two to understand a `GithubRepoSource` would put GitHub's data
 * model inside the module that decides whether a POST is published, for the
 * benefit of one caller.
 *
 * So the ORCHESTRATION is duplicated (about twenty lines) and the STATEMENTS
 * are shared, which is the right side of that trade: the duplicated part is a
 * sequence anyone can read, and the shared part is the part where a divergence
 * would be a bug — two different upsert keys, or a hash comparison that skips
 * a column, is how an index quietly splits in two.
 *
 * The ordering is copied deliberately and for the reasons
 * `syncDocumentEmbeddings` gives: hashes are read and compared BEFORE the
 * provider is called, so a re-sync over an unchanged repo spends nothing.
 */

/**
 * Bring one repository's rows in line with its current state.
 *
 * @remarks Three outcomes, and the middle one is the acceptance criterion
 * about spend:
 *
 * 1. Nothing changed — `skipped`, one indexed SELECT, **zero provider calls**.
 * 2. Only `published_at` moved (a push with no content change to the README or
 *    metadata this document renders) — a plain UPDATE, still no provider call.
 *    This is not a micro-optimisation: `pushed_at` changes on every push, so
 *    without this branch a weekly sync would re-embed every active repo every
 *    week for a timestamp.
 * 3. The document's text changed — embed and upsert.
 *
 * There is no `isMetadataTightening` pre-write as there is for CMS documents,
 * and its absence is a consequence of the never-leak design rather than an
 * omission: a repo row's `visibility` is the constant `'public'` (see
 * `chunkGithubRepo`), so it has no tightening direction. The event this
 * collection has to survive — a repo going private — is not a metadata flip
 * at all; the repo simply stops appearing in the listing, and
 * {@link staleRepoDocIds} removes it.
 *
 * May throw (a provider outage, a database error). The caller — a script, not
 * a hook — is expected to log it, count it, and carry on to the next repo.
 *
 * @param args - Database handle, the repository, optional abort signal.
 * @returns A {@link SyncResult} describing what changed.
 */
export async function syncGithubRepoEmbeddings(args: {
  db: CorvusEmbeddingsDb
  repo: GithubRepoSource
  abortSignal?: AbortSignal
}): Promise<SyncResult> {
  const { db, repo } = args
  const collection = CORVUS_GITHUB_REPOS_COLLECTION

  const chunks: CorvusChunk[] = chunkGithubRepo(repo)
  if (!chunks.length) {
    await deleteDocumentEmbeddings(db, collection, repo.id)
    return { written: 0, deleted: 1, metadataUpdated: 0, skipped: false }
  }

  const stored = await readStoredChunks(db, collection, repo.id)
  if (isContentUnchanged(chunks, stored)) {
    if (!hasMetadataDrift(chunks, stored)) {
      return { written: 0, deleted: 0, metadataUpdated: 0, skipped: true }
    }
    await updateDocumentMetadata(
      db,
      collection,
      repo.id,
      chunks[0].visibility,
      chunks[0].publishedAt,
      chunks[0].sourceUrl,
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
  await deleteTrailingChunks(db, collection, repo.id, chunks.length)

  return {
    written: chunks.length,
    deleted: 0,
    metadataUpdated: 0,
    skipped: false,
  }
}

/**
 * Every repository id currently represented in the index.
 *
 * @remarks `DISTINCT` because a repo with a long README owns several rows and
 * this is a question about DOCUMENTS. Scoped to `collection = 'github-repos'`,
 * so nothing this module does can see — much less delete — a CMS row.
 *
 * @param db - Payload's drizzle instance.
 * @returns The distinct `doc_id` values, ascending.
 */
export async function readIndexedRepoDocIds(
  db: CorvusEmbeddingsDb,
): Promise<number[]> {
  const result = await db.execute(sql`
    SELECT DISTINCT "doc_id"
    FROM "corvus_embeddings"
    WHERE "collection" = ${CORVUS_GITHUB_REPOS_COLLECTION}
    ORDER BY "doc_id"
  `)

  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : (((result as { rows?: unknown } | null)?.rows as
        Array<Record<string, unknown>> | undefined) ?? [])

  return rows
    .map((row) => Number(row.doc_id))
    .filter((id) => Number.isInteger(id))
}

/**
 * Which indexed repositories the current listing no longer accounts for.
 *
 * @remarks THE never-leak computation, and pure so it can be tested as
 * arithmetic rather than inferred from a database's behaviour. A repo made
 * private, deleted, renamed away, or dropped from the listing for any other
 * reason is absent from `seen` and therefore stale.
 *
 * @param indexed - Every `doc_id` currently in the index.
 * @param seen - Every repo id this run successfully accounted for.
 * @returns The ids whose rows must be removed, ascending.
 */
export function staleRepoDocIds(
  indexed: readonly number[],
  seen: readonly number[],
): number[] {
  const kept = new Set(seen)
  return [...new Set(indexed)]
    .filter((id) => !kept.has(id))
    .sort((a, b) => a - b)
}

/** Why a sweep was refused, or `null` when it may run. */
export type SweepRefusal =
  'listing-incomplete' | 'empty-listing' | 'nothing-accounted-for' | null

/**
 * May this run delete the repositories it did not see?
 *
 * @remarks The sibling of `canDropOrphans` in `scripts/lib/orphan-guard.mjs`,
 * and deliberately NOT that function. Two reasons, both about direction:
 * `src/lib/` must not import out of `scripts/`, and the two rules genuinely
 * differ. The backfill's sweep is opt-in (`--drop-orphans`) because a stale
 * CMS row is merely stale; this sweep runs by DEFAULT, because a stale repo
 * row is a repo that has gone private and is still being served to anonymous
 * visitors. The polarity is inverted on purpose, and that makes the guard on
 * this side more important rather than less.
 *
 * What it refuses:
 *
 * - **An incomplete listing.** If any page of the repo listing failed, this
 *   run does not know what exists. Deleting on a partial read would empty the
 *   index the first time GitHub had a bad minute.
 * - **An empty listing.** The same refusal `canDropOrphans` calls `empty-read`,
 *   for the same reason: an empty result is far more often a broken read than
 *   an account that genuinely has no public repos.
 * - **Nothing accounted for.** Repos were listed but every one of them failed
 *   to index. The run has no positive evidence about any repo, so it has no
 *   basis to declare the rest dead.
 *
 * Note what is NOT refused: a run where SOME repos failed. Those repos are in
 * `seen` only if they indexed, so a repo that failed mid-run would be swept —
 * which is why the caller adds every repo it LISTED to `seen`, not only the
 * ones it embedded. See `scripts/sync-github-repos.ts`.
 *
 * @param listedCount - Repositories the listing returned.
 * @param accountedCount - Repositories this run accounted for.
 * @param listingComplete - Whether every listing page was read successfully.
 * @returns `{ sweep, reason }`; `reason` is `null` when `sweep` is true.
 */
export function canSweepGithubRepos(
  listedCount: number,
  accountedCount: number,
  listingComplete: boolean,
): { sweep: boolean; reason: SweepRefusal } {
  if (!listingComplete) return { sweep: false, reason: 'listing-incomplete' }
  if (listedCount === 0) return { sweep: false, reason: 'empty-listing' }
  if (accountedCount === 0) {
    return { sweep: false, reason: 'nothing-accounted-for' }
  }
  return { sweep: true, reason: null }
}

/**
 * Remove every row for the given repositories.
 *
 * @remarks One `deleteDocumentEmbeddings` per id, rather than one statement
 * with a `NOT IN` list. Slower, and correct for a different reason than speed:
 * a `NOT IN` sweep interpolates an id list with `sql.raw` (parameter binding
 * cannot express a variable-length list in one drizzle fragment) and deletes
 * everything the list does not name — so a bug in how the list is built
 * deletes the whole collection. Deleting by explicit, positively-identified id
 * has no such failure mode: the worst a bug can do is delete too few. At the
 * scale this runs at — tens of repos, a handful ever stale — the extra
 * round trips are free.
 *
 * @param db - Payload's drizzle instance.
 * @param docIds - Repository ids to remove.
 * @returns How many documents were deleted.
 */
export async function deleteGithubRepoDocuments(
  db: CorvusEmbeddingsDb,
  docIds: readonly number[],
): Promise<number> {
  let deleted = 0
  for (const docId of docIds) {
    await deleteDocumentEmbeddings(db, CORVUS_GITHUB_REPOS_COLLECTION, docId)
    deleted += 1
  }
  return deleted
}
