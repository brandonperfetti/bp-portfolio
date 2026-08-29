import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import configPromise from '@payload-config'

import {
  EMBEDDING_TIMEOUT_MS,
  embedQuery,
  toVectorLiteral,
} from '@/lib/ai/embeddings'

/** One retrieved passage, ready to be rendered into the grounded context. */
export interface CorvusSnippet {
  collection: string
  title: string | null
  content: string
  sourceUrl: string | null
  /** Cosine similarity in [-1, 1]; 1 is identical. */
  score: number
}

/** Default number of snippets handed to the model (`CORVUS_RETRIEVAL_TOP_K`). */
export const DEFAULT_RETRIEVAL_TOP_K = 5

/**
 * Rows fetched per requested snippet before the similarity floor is applied.
 *
 * @remarks Over-fetching is what makes the floor meaningful. A distance-sorted
 * query with `LIMIT 5` ALWAYS returns five rows if five rows exist,
 * however unrelated they are — a vector index has no notion of "no match". So
 * we ask for 4× and let TypeScript discard everything under the floor, which
 * is how "the query misses" becomes a real, testable code path that returns
 * `[]` instead of five confident irrelevancies.
 */
export const RETRIEVAL_OVERFETCH_FACTOR = 4

/**
 * Minimum cosine similarity for a chunk to count as grounding.
 *
 * @remarks Not an env var on purpose — #82's env surface is five names, and a
 * sixth tuning knob nobody has data for is worse than a constant with a
 * comment. 0.35 is a conservative starting point for
 * `text-embedding-3-small`: normalized OpenAI embeddings of genuinely related
 * short passages sit well above it, and unrelated ones sit below. Tune it here
 * with eval evidence (Batch 4), not in production env.
 */
export const CORVUS_SIMILARITY_FLOOR = 0.35

/**
 * Wall-clock ceiling for the vector query, in milliseconds.
 *
 * @remarks The embedding call above it is already bounded by
 * {@link EMBEDDING_TIMEOUT_MS}; this bounds the half that was not. Retrieval
 * is awaited BEFORE `streamText`, so an unbounded query does not merely make
 * retrieval slow — it delays time-to-first-token for the whole answer, up to
 * the route's `maxDuration = 60`. 5s is generous for an HNSW lookup over this
 * corpus and keeps the pre-token worst case at roughly 15s (10s embed + 5s
 * query) instead of a minute.
 */
export const RETRIEVAL_QUERY_TIMEOUT_MS = 5_000

/**
 * Reject after `ms` if `work` has not settled.
 *
 * @remarks A `Promise.race`, NOT a server-side `SET LOCAL statement_timeout`,
 * and the difference is worth recording. `SET LOCAL` only survives inside a
 * transaction, so applying it here would mean opening one on Payload's own
 * pooled connection purely to bound a single read — an extra round trip plus a
 * transaction on the hot path, on a Supavisor-pooled connection where the
 * session-level alternative would leak the setting to whatever runs next.
 *
 * The honest cost of the race is that it bounds the WAIT, not the query: the
 * statement keeps running in Postgres until it finishes on its own. That is
 * the right trade here because the harm being prevented is a stalled
 * time-to-first-token, not database load — and a timeout lands in
 * {@link retrieveCorvusContext}'s existing catch, which degrades to an
 * ungrounded answer exactly as a provider outage already does.
 *
 * @param work - The promise to bound.
 * @param ms - Milliseconds to wait.
 * @param message - Error message used when the bound is hit.
 * @returns `work`'s value, or a rejection once `ms` elapses.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    // Always clear it: a pending timer keeps the serverless function's event
    // loop alive after the answer has already streamed.
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Is retrieval switched off?
 *
 * @remarks Follows the repo's established "empty var ⇒ zero code" kill-switch
 * idiom (`CORVUS_DISABLE_CHAT`, `CORVUS_DISABLE_IMAGE`, Sentry, Turnstile):
 * unset or anything but the exact string `'true'` leaves retrieval on. When
 * on, the switch short-circuits BEFORE the embedding call and before any
 * database access, so flipping it is a true one-flag revert to the
 * pre-#82 chat path, not a more expensive way to get the same answer.
 *
 * @returns `true` when `CORVUS_DISABLE_RETRIEVAL === 'true'`.
 */
export function isRetrievalDisabled(): boolean {
  return process.env.CORVUS_DISABLE_RETRIEVAL === 'true'
}

/**
 * The configured top-k.
 *
 * @returns `CORVUS_RETRIEVAL_TOP_K` when it parses to a positive integer,
 * otherwise {@link DEFAULT_RETRIEVAL_TOP_K}.
 */
export function getRetrievalTopK(): number {
  const parsed = Number(process.env.CORVUS_RETRIEVAL_TOP_K)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_RETRIEVAL_TOP_K
}

/**
 * Build the vector-search query.
 *
 * @remarks Two predicates carry all the safety in this feature, and neither is
 * optional:
 *
 * - `($isAuthenticated::boolean OR visibility = 'public')` is the gating
 *   filter. `src/access/canAccess.ts` is described in-tree as "THE single
 *   authoritative check — RSCs/routes must call it before including gated
 *   bodies in any payload sent to the client", and a grounded chat answer is
 *   such a payload. Anonymous turns pass `false`, which collapses the
 *   disjunction to `visibility = 'public'`; signed-in turns pass `true`, which
 *   short-circuits it. The boolean truth table this produces is pinned by
 *   test, because a regression here is a gated-content bypass, not a bug.
 * - `(published_at IS NULL OR published_at <= now())` excludes scheduled-future
 *   posts, matching how the rest of the site treats them
 *   (`isFuturePublicationDate`). `NULL` means "not a scheduled thing" — the
 *   four flat collections — and must stay retrievable.
 *
 * `<=>` is pgvector's COSINE DISTANCE operator (0 = identical), which is why
 * the score is `1 - distance` and the sort is ASCENDING. It is also the
 * operator class the migration's HNSW index was built with
 * (`vector_cosine_ops`); using `<->` or `<#>` here would silently stop using
 * that index.
 *
 * Executed through `payload.db.drizzle` — Payload's OWN pool. A second pool
 * would be a real hazard under Supavisor transaction-mode pooling, and a
 * direct `pg` client would be a new dependency for something the adapter
 * already exposes.
 *
 * @param vectorLiteral - The query embedding as a pgvector `[..]` literal.
 * @param isAuthenticated - Whether the requester has a Clerk session.
 * @param limit - Row limit (already over-fetched by the caller).
 * @returns A drizzle SQL fragment with every value bound as a parameter.
 */
export function buildRetrievalQuery(
  vectorLiteral: string,
  isAuthenticated: boolean,
  limit: number,
) {
  return sql`
    SELECT "collection", "title", "content", "source_url",
           1 - ("embedding" <=> ${vectorLiteral}::vector) AS "score"
    FROM "corvus_embeddings"
    WHERE (${isAuthenticated}::boolean OR "visibility" = 'public')
      AND ("published_at" IS NULL OR "published_at" <= now())
    ORDER BY "embedding" <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `
}

/** A raw row as the driver returns it. */
type RetrievalRow = Record<string, unknown>

/**
 * Normalize whatever the drizzle adapter hands back into rows.
 *
 * @remarks `NodePgDatabase.execute` resolves to a node-postgres `QueryResult`
 * (`.rows`), but the adapter's type is a union that also covers a replica
 * wrapper, and other drizzle drivers resolve straight to an array. Accepting
 * both costs three lines and removes a whole class of "worked in tests, threw
 * in production" failure.
 *
 * @param result - The raw `execute` result.
 * @returns The row array, or `[]` when the shape is unrecognized.
 */
export function toRows(result: unknown): RetrievalRow[] {
  if (Array.isArray(result)) return result as RetrievalRow[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as RetrievalRow[]) : []
}

/**
 * Map rows to snippets, drop everything below the floor, and take the top k.
 *
 * @remarks Pure, so the "a total miss yields `[]`" behavior is unit-testable
 * without a database. Rows arrive already distance-sorted from Postgres; the
 * sort here is defensive and free at these sizes.
 *
 * @param rows - Raw rows from {@link buildRetrievalQuery}.
 * @param topK - Maximum snippets to return.
 * @param floor - Minimum similarity, defaulting to {@link CORVUS_SIMILARITY_FLOOR}.
 * @returns Snippets above the floor, best first.
 */
export function applySimilarityFloor(
  rows: RetrievalRow[],
  topK: number,
  floor: number = CORVUS_SIMILARITY_FLOOR,
): CorvusSnippet[] {
  return rows
    .map((row) => ({
      collection: String(row.collection ?? ''),
      title: row.title == null ? null : String(row.title),
      content: String(row.content ?? ''),
      sourceUrl: row.source_url == null ? null : String(row.source_url),
      score: Number(row.score),
    }))
    .filter(
      (snippet) =>
        snippet.content.length > 0 &&
        Number.isFinite(snippet.score) &&
        snippet.score >= floor,
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * The text retrieval should search for, taken from the latest user message.
 *
 * @remarks Only the most recent user turn is embedded. Concatenating the whole
 * window would blur the query vector across topics and make retrieval worse
 * the longer a conversation ran — the opposite of what more context implies.
 *
 * @param messages - The validated, windowed UI messages.
 * @returns The latest user turn's text, or `''` when there is none.
 */
export function extractRetrievalQuery(messages: unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as
      { role?: unknown; parts?: unknown } | null | undefined
    if (message?.role !== 'user') continue
    const parts = Array.isArray(message.parts) ? message.parts : []
    const text = parts
      .map((part) => {
        const typed = part as { type?: unknown; text?: unknown }
        return typed?.type === 'text' && typeof typed.text === 'string'
          ? typed.text
          : ''
      })
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) return text
  }
  return ''
}

/** Arguments for {@link retrieveCorvusContext}. */
export interface RetrieveCorvusContextArgs {
  /** The visitor's latest message. */
  query: string
  /** Whether the visitor has a Clerk session — the gating input. */
  isAuthenticated: boolean
  /** Overrides `CORVUS_RETRIEVAL_TOP_K`. */
  topK?: number
}

/**
 * Retrieve grounding passages for one chat turn. NEVER REJECTS.
 *
 * @remarks This is the whole dark-launch contract in one function. Every
 * failure path — kill switch, empty query, provider outage, embedding-dimension
 * mismatch, database error, an empty table, a query that simply misses —
 * returns `[]`, and `buildGroundedSystem([])` returns `CORVUS_SYSTEM_PROMPT`
 * byte-identical. So the worst case of this entire feature is exactly today's
 * behavior, and #82's "no chat guardrail changes / degrade gracefully" ACs are
 * discharged by construction rather than by hoping.
 *
 * That is also why the `catch` is deliberately broad and swallowing: a
 * rethrow, or a rejected promise escaping to the route, would turn a retrieval
 * hiccup into a failed chat response. The failure is logged, not surfaced.
 *
 * BOTH round trips are bounded, which is what keeps "degrade gracefully" a
 * time guarantee and not just an error-handling one: the embedding call by
 * {@link EMBEDDING_TIMEOUT_MS} and the vector query by
 * {@link RETRIEVAL_QUERY_TIMEOUT_MS}. A slow query therefore costs a bounded
 * delay and an ungrounded answer, rather than holding time-to-first-token
 * hostage until the route's `maxDuration`.
 *
 * @param args - Query, viewer auth state, optional top-k override.
 * @returns Snippets above the similarity floor; `[]` on any failure.
 */
export async function retrieveCorvusContext(
  args: RetrieveCorvusContextArgs,
): Promise<CorvusSnippet[]> {
  try {
    if (isRetrievalDisabled()) return []

    const query = args.query?.trim()
    if (!query) return []

    const topK = args.topK ?? getRetrievalTopK()
    const embedding = await embedQuery(query, {
      abortSignal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    })

    const payload = await getPayload({ config: configPromise })
    const result = await withTimeout(
      payload.db.drizzle.execute(
        buildRetrievalQuery(
          toVectorLiteral(embedding),
          args.isAuthenticated,
          topK * RETRIEVAL_OVERFETCH_FACTOR,
        ),
      ),
      RETRIEVAL_QUERY_TIMEOUT_MS,
      `[corvus] retrieval query exceeded ${RETRIEVAL_QUERY_TIMEOUT_MS}ms`,
    )

    return applySimilarityFloor(toRows(result), topK)
  } catch (error) {
    console.error('[corvus] retrieval failed; answering ungrounded:', error)
    return []
  }
}
