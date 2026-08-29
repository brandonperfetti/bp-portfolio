import { openai } from '@ai-sdk/openai'
import { embed, embedMany } from 'ai'

/**
 * Embedding models Corvus is allowed to run (#82, decision D6(a)).
 *
 * @remarks `text-embedding-ada-002` is deliberately excluded even though the
 * installed `@ai-sdk/openai` declares it: it does not support the
 * `dimensions` parameter, and this module's whole dimension contract rests on
 * always passing one. Allowing it would mean silently writing 1536-wide
 * vectors that happen to fit today and breaking the moment the configured
 * dimension changed.
 */
export const SUPPORTED_EMBEDDING_MODELS = [
  'text-embedding-3-small',
  'text-embedding-3-large',
] as const

/** Default model — `text-embedding-3-small` at its native 1536 (D6(a)). */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

/**
 * Default dimension, pinned to the migration's `vector(1536)`.
 *
 * @remarks Also inside pgvector's 2,000-dimension ceiling for an HNSW index
 * over the `vector` type — which is what rules out `-3-large`'s native 3072
 * without switching the column to `halfvec`.
 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536

/** Wall-clock ceiling for a single embedding round-trip, in milliseconds. */
export const EMBEDDING_TIMEOUT_MS = 10_000

/**
 * How many values `embedMany` may send per provider call.
 *
 * @remarks `@ai-sdk/openai@3.0.87`'s embedding model declares
 * `maxEmbeddingsPerCall = 2048`; the SDK splits larger inputs itself, so this
 * is documentation of the boundary rather than a limit this code enforces.
 */
export const MAX_EMBEDDINGS_PER_CALL = 2048

/**
 * The configured embedding dimension.
 *
 * @remarks `AI_EMBEDDING_DIMENSIONS` is an assertion-and-documentation var,
 * not a free knob: the width is baked into the DDL, so actually changing it
 * requires a new migration. Its job here is to make a mismatch loud — see
 * {@link assertEmbeddingDimension}.
 *
 * @returns The dimension every vector written or queried must have.
 */
export function getEmbeddingDimensions(): number {
  const parsed = Number(process.env.AI_EMBEDDING_DIMENSIONS)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EMBEDDING_DIMENSIONS
}

/**
 * The configured embedding model id.
 *
 * @returns The model id from `AI_EMBEDDING_MODEL`, or the default.
 * @throws If the configured id is not in {@link SUPPORTED_EMBEDDING_MODELS}.
 */
export function getEmbeddingModelId(): string {
  const configured = process.env.AI_EMBEDDING_MODEL?.trim()
  if (!configured) return DEFAULT_EMBEDDING_MODEL

  if (!(SUPPORTED_EMBEDDING_MODELS as readonly string[]).includes(configured)) {
    throw new Error(
      `AI_EMBEDDING_MODEL "${configured}" is not supported. ` +
        `Supported: ${SUPPORTED_EMBEDDING_MODELS.join(', ')}.`,
    )
  }
  return configured
}

/**
 * The embedding model, pinned to OpenAI.
 *
 * @remarks The embedding provider is its OWN env axis
 * (`AI_EMBEDDING_PROVIDER`), not a function of `AI_CHAT_PROVIDER`, because
 * `@ai-sdk/anthropic` ships no embedding model at all — flipping Corvus's chat
 * to Claude must not take the index down with it. A non-`openai` value is a
 * configuration error and fails loudly rather than falling back, so nobody
 * discovers the pin by wondering why their setting did nothing.
 *
 * @returns The AI SDK embedding model for the configured id.
 * @throws If `AI_EMBEDDING_PROVIDER` names a provider with no embedding model.
 */
export function getCorvusEmbeddingModel() {
  const provider = (process.env.AI_EMBEDDING_PROVIDER || 'openai')
    .trim()
    .toLowerCase()
  if (provider !== 'openai') {
    throw new Error(
      `AI_EMBEDDING_PROVIDER "${provider}" is not supported — embeddings are ` +
        `pinned to OpenAI (no other installed provider ships an embedding model).`,
    )
  }
  return openai.embeddingModel(getEmbeddingModelId())
}

/**
 * Hard failure when a provider returns a vector of the wrong width.
 *
 * @remarks Decision D6(a) calls for this at WRITE time. A short or long vector
 * would be rejected by Postgres against `vector(1536)` anyway, but as an
 * opaque driver error mid-batch; throwing here names the model, the expected
 * width, and what was actually returned. It also catches the more insidious
 * case where a future provider silently truncates.
 *
 * @param vector - The returned embedding.
 * @param dimensions - The expected width.
 * @param context - Short description of what was being embedded, for the message.
 * @throws If `vector.length !== dimensions`.
 */
export function assertEmbeddingDimension(
  vector: readonly number[],
  dimensions: number,
  context = 'embedding',
): void {
  if (vector.length !== dimensions) {
    throw new Error(
      `Embedding dimension mismatch for ${context}: expected ${dimensions}, ` +
        `got ${vector.length} (model ${getEmbeddingModelId()}). ` +
        `corvus_embeddings.embedding is vector(${dimensions}); refusing to write.`,
    )
  }
}

/**
 * Render a vector as a pgvector literal.
 *
 * @remarks pgvector's text input format is `[1,2,3]`. Passed as a bound
 * parameter and cast with `::vector` at the call site, never interpolated.
 *
 * @param vector - The embedding.
 * @returns A `[..]` literal string.
 */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.join(',')}]`
}

/** Options shared by both embed helpers. */
export interface EmbedOptions {
  /** Overrides the default {@link EMBEDDING_TIMEOUT_MS} bound. */
  abortSignal?: AbortSignal
}

/**
 * The provider options every call must carry.
 *
 * @remarks Always sending an explicit `dimensions` is what lets
 * `text-embedding-3-large` be swapped in later WITHOUT a migration: the
 * provider truncates to the requested width, so the column stays
 * `vector(1536)` whatever the model's native size is.
 */
const providerOptions = (dimensions: number) => ({
  openai: { dimensions },
})

/**
 * Embed a single query string.
 *
 * @remarks This is the one provider round-trip retrieval makes per chat turn,
 * ahead of `streamText` — so it lands on time-to-first-token, not on the
 * stream, and is bounded by {@link EMBEDDING_TIMEOUT_MS}.
 *
 * @param value - Text to embed.
 * @param options - Optional abort signal.
 * @returns The embedding vector.
 * @throws If the returned vector's width is not the configured dimension.
 */
export async function embedQuery(
  value: string,
  options: EmbedOptions = {},
): Promise<number[]> {
  const dimensions = getEmbeddingDimensions()
  const { embedding } = await embed({
    model: getCorvusEmbeddingModel(),
    value,
    providerOptions: providerOptions(dimensions),
    abortSignal:
      options.abortSignal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
  })

  assertEmbeddingDimension(embedding, dimensions, 'query')
  return embedding
}

/**
 * Embed a batch of chunk texts.
 *
 * @remarks `embedMany` returns embeddings "in the same order as input", which
 * is the property the caller relies on to pair each vector back to its chunk.
 * Every returned vector is width-checked before any of them is written, so a
 * bad batch fails whole rather than half-writing a document's chunks.
 *
 * @param values - Chunk texts, in chunk order.
 * @param options - Optional abort signal.
 * @returns Embedding vectors, in the same order as `values`.
 * @throws If any returned vector's width is not the configured dimension.
 */
export async function embedChunks(
  values: string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  if (!values.length) return []

  const dimensions = getEmbeddingDimensions()
  const { embeddings } = await embedMany({
    model: getCorvusEmbeddingModel(),
    values,
    providerOptions: providerOptions(dimensions),
    abortSignal:
      options.abortSignal ?? AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
  })

  embeddings.forEach((embedding, index) => {
    assertEmbeddingDimension(embedding, dimensions, `chunk ${index}`)
  })
  return embeddings as number[][]
}
