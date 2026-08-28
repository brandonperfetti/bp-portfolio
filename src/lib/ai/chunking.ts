import { createHash } from 'node:crypto'

import { flattenBlockText } from '@/lib/content/flattenBlockText'
import { lexicalToBlocks } from '@/lib/content/lexicalToBlocks'

/**
 * The five collections Corvus embeds (#82, decision D8(b)).
 *
 * @remarks Pages are deliberately absent: they are layout chrome, and
 * embedding them buys retrieval noise rather than facts. Categories/Tags are
 * absent for the same reason — a taxonomy label carries no prose. Both are
 * additive later with no schema change, because `corvus_embeddings.collection`
 * is a plain `text` column, not an enum.
 *
 * This list is the single source of truth for which collections carry a
 * refresh hook; wiring a hook onto a collection that is not in here (or the
 * reverse) is the drift this constant exists to prevent.
 */
export const CORVUS_EMBEDDED_COLLECTIONS = [
  'posts',
  'projects',
  'uses',
  'tech-stack',
  'work-history',
] as const

/** A collection slug Corvus embeds. */
export type CorvusCollectionSlug = (typeof CORVUS_EMBEDDED_COLLECTIONS)[number]

/**
 * One row destined for `corvus_embeddings`, minus the vector itself.
 *
 * @remarks Field names mirror the migration's columns
 * (`20260828_155359_corvus_embeddings.ts`) in camelCase. `visibility` and
 * `publishedAt` are denormalized copies of the source document's gating and
 * schedule state so retrieval can filter on them in SQL without joining back
 * into Payload — see `src/access/canAccess.ts` for why the filter is
 * mandatory, not an optimization.
 */
export interface CorvusChunk {
  collection: CorvusCollectionSlug
  docId: number
  chunkIndex: number
  title: string | null
  content: string
  contentHash: string
  sourceUrl: string | null
  visibility: 'public' | 'gated'
  publishedAt: string | null
}

/**
 * Target chunk size in estimated tokens (research §3.5: ~300–500 tokens).
 *
 * @remarks A chunk closes as soon as it reaches TARGET, and never grows past
 * MAX unless a single source block is itself larger than MAX (a long code
 * block, say) — an oversized block is kept whole rather than cut mid-token,
 * because splitting inside one is worse for retrieval than one fat chunk.
 */
export const TARGET_CHUNK_TOKENS = 400

/** Hard ceiling before a new block is forced into the next chunk. */
export const MAX_CHUNK_TOKENS = 500

/** Tokens of trailing text repeated at the head of the next chunk. */
export const CHUNK_OVERLAP_TOKENS = 50

/**
 * Rough token count — deliberately a heuristic, not a tokenizer.
 *
 * @remarks ~4 characters per token is the standard OpenAI rule of thumb. A
 * real tokenizer (`js-tiktoken`) would be a new runtime dependency for a
 * decision that only picks chunk boundaries; being 15% off just makes chunks
 * slightly larger or smaller, which retrieval quality is insensitive to at
 * this corpus size.
 *
 * @param text - Text to size.
 * @returns Estimated token count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4)
}

/**
 * Stable content fingerprint — the column that makes hook-driven refresh cheap.
 *
 * @remarks sha256 hex, matching the migration's `content_hash` comment. The
 * hook compares this against the stored row BEFORE calling the embedding
 * provider, so a metadata-only edit (a tag change, a re-slug) re-embeds
 * nothing and costs nothing.
 *
 * @param content - The exact chunk text that will be embedded.
 * @returns Lowercase hex sha256 digest.
 */
export function hashChunkContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * The site URL a chunk cites, per collection.
 *
 * @remarks Posts get their own article page; the four flat collections have no
 * per-document route, so they cite the index page that renders them. Corvus
 * renders these as markdown links in its grounded answers — the chat surface
 * already renders markdown, which is why citations need no client change.
 *
 * @param collection - Collection slug.
 * @param slug - The document's slug, for collections that have per-doc routes.
 * @returns A site-relative URL, or `null` when none applies.
 */
export function sourceUrlFor(
  collection: CorvusCollectionSlug,
  slug?: string | null,
): string | null {
  switch (collection) {
    case 'posts':
      return slug ? `/articles/${slug}` : null
    case 'projects':
      return '/projects'
    case 'uses':
      return '/uses'
    case 'tech-stack':
      return '/tech'
    case 'work-history':
      return '/'
  }
}

/** Minimal structural view of a document; the chunkers never need Payload types. */
type SourceDoc = Record<string, unknown>

const str = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const label = (name: string, value: unknown): string | null => {
  const text = str(value)
  return text ? `${name}: ${text}` : null
}

/**
 * Take roughly `tokens` worth of trailing words from `text`.
 *
 * @remarks Word-aligned so the overlap never starts mid-word, which would
 * hand the embedding model a nonsense leading fragment.
 *
 * @param text - Source text.
 * @param tokens - Approximate token budget for the tail.
 * @returns The trailing slice, or `''` when `text` is empty.
 */
export function takeTailTokens(text: string, tokens: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''

  const budget = tokens * 4
  const kept: string[] = []
  let size = 0
  for (let i = words.length - 1; i >= 0; i--) {
    const next = size + words[i].length + (kept.length ? 1 : 0)
    if (next > budget && kept.length) break
    kept.unshift(words[i])
    size = next
  }
  return kept.join(' ')
}

/**
 * Visibility of a document, defaulting to public exactly as `canAccess` does.
 *
 * @remarks Mirrors `canAccess`'s `doc?.access?.visibility ?? 'public'` so a
 * document with no access group is treated identically in both places. Any
 * value other than the two known ones is read as `'gated'` — an unrecognized
 * visibility must fail closed, never open.
 *
 * @param doc - The source document.
 * @returns `'public'` or `'gated'`.
 */
export function visibilityOf(doc: SourceDoc): 'public' | 'gated' {
  const access = doc.access as { visibility?: unknown } | null | undefined
  const raw = access?.visibility
  if (raw === undefined || raw === null || raw === 'public') return 'public'
  return 'gated'
}

/**
 * Chunk a Post body into overlapping, block-aligned passages.
 *
 * @remarks Reuses the search index's existing text path
 * (`lexicalToBlocks` → `flattenBlockText`) rather than writing a second
 * Lexical walker. `flattenBlockText` is called one block at a time — it joins
 * everything it is handed into a single string, so passing the whole array
 * would destroy exactly the block boundaries this chunker splits on. Neither
 * helper is modified.
 *
 * Note that `flattenBlockText` lowercases its output. That is pre-existing
 * behavior shared with `/api/search`, and harmless here: embedding models are
 * effectively case-insensitive, and the human-readable identity of the chunk
 * comes from the title/excerpt prefix, which is not passed through it.
 *
 * Every chunk carries a `"<title> — <excerpt>"` prefix so a passage from deep
 * inside an article still says which article it is — without it, a chunk
 * about "the third approach" is unusable as grounding.
 *
 * A published post with an empty body still yields one prefix-only chunk, so
 * the article remains findable by title.
 *
 * @param doc - A Post document (published; the caller decides eligibility).
 * @returns Ordered chunks, `chunkIndex` starting at 0.
 */
export function chunkPost(doc: SourceDoc): CorvusChunk[] {
  const docId = Number(doc.id)
  const title = str(doc.title) || null
  const excerpt = str(doc.excerpt)
  const prefixParts = [title, excerpt].filter(Boolean) as string[]
  const prefix = prefixParts.join(' — ')

  const segments = lexicalToBlocks(doc.content)
    .map((block) => flattenBlockText([block]))
    .filter((text) => text.length > 0)

  const bodies: string[] = []
  let current: string[] = []
  let tokens = 0
  let overlap = ''

  const flush = () => {
    if (!current.length) return
    const body = current.join('\n')
    bodies.push(body)
    overlap = takeTailTokens(body, CHUNK_OVERLAP_TOKENS)
    current = []
    tokens = 0
  }

  for (const segment of segments) {
    const segmentTokens = estimateTokens(segment)
    if (current.length && tokens + segmentTokens > MAX_CHUNK_TOKENS) {
      flush()
    }
    if (!current.length && overlap) {
      current.push(overlap)
      tokens = estimateTokens(overlap)
    }
    current.push(segment)
    tokens += segmentTokens
    if (tokens >= TARGET_CHUNK_TOKENS) {
      flush()
    }
  }
  flush()

  if (!bodies.length) {
    if (!prefix) return []
    bodies.push('')
  }

  const visibility = visibilityOf(doc)
  const publishedAt = str(doc.publishedAt) || null
  const sourceUrl = sourceUrlFor('posts', str(doc.slug) || null)

  return bodies.map((body, index) => {
    const content = prefix && body ? `${prefix}\n\n${body}` : prefix || body
    return {
      collection: 'posts',
      docId,
      chunkIndex: index,
      title,
      content,
      contentHash: hashChunkContent(content),
      sourceUrl,
      visibility,
      publishedAt,
    }
  })
}

const techNames = (value: unknown): string => {
  if (!Array.isArray(value)) return ''
  return value
    .map((entry) =>
      entry && typeof entry === 'object'
        ? str((entry as { name?: unknown }).name)
        : '',
    )
    .filter(Boolean)
    .join(', ')
}

const dateOnly = (value: unknown): string => str(value).slice(0, 10)

/**
 * Render one flat-collection document as a single labelled record.
 *
 * @remarks These four collections are small, flat, and draft-free — a
 * Project or a WorkHistory entry is already about the size of one chunk, so
 * splitting it would only separate a job title from its dates. The labelled
 * `"Field: value"` shape is what makes them answer the questions #82 says
 * Corvus currently paraphrases from the persona prompt ("where has Brandon
 * worked", "what's in his stack").
 *
 * @param collection - One of the four flat collections.
 * @param doc - The document.
 * @returns A single-element chunk array, or `[]` when the record is empty.
 */
export function chunkFlatRecord(
  collection: Exclude<CorvusCollectionSlug, 'posts'>,
  doc: SourceDoc,
): CorvusChunk[] {
  let title: string | null = null
  let lines: Array<string | null> = []

  switch (collection) {
    case 'projects':
      title = str(doc.title) || null
      lines = [
        label('Project', doc.title),
        label('Year', doc.year),
        label('Description', doc.description),
        label('Link', doc.link),
        label('Tech', techNames(doc.tech)),
      ]
      break
    case 'uses':
      title = str(doc.title) || null
      lines = [
        label('Uses entry', doc.title),
        label('Category', doc.category),
        label('Description', doc.description),
        label('Link', doc.link),
      ]
      break
    case 'tech-stack':
      title = str(doc.name) || null
      lines = [
        label('Technology', doc.name),
        label('Category', doc.category),
        label('Proficiency', doc.proficiency),
        label('URL', doc.url),
        label('Notes', doc.notes),
      ]
      break
    case 'work-history': {
      const company = str(doc.company)
      const role = str(doc.title)
      title = [company, role].filter(Boolean).join(' — ') || null
      const start = dateOnly(doc.startDate)
      const end = doc.current ? 'Present' : dateOnly(doc.endDate)
      lines = [
        label('Company', company),
        label('Title', role),
        start ? `Period: ${start} – ${end || 'Present'}` : null,
        label('Description', doc.description),
      ]
      break
    }
  }

  const content = lines.filter(Boolean).join('\n')
  if (!content) return []

  return [
    {
      collection,
      docId: Number(doc.id),
      chunkIndex: 0,
      title,
      content,
      contentHash: hashChunkContent(content),
      sourceUrl: sourceUrlFor(collection),
      // These four collections carry no access group — they render on public
      // index pages, so they are public by construction. Reading through
      // `visibilityOf` anyway means a future access group on any of them is
      // honoured the day it is added, instead of silently embedding as public.
      visibility: visibilityOf(doc),
      publishedAt: null,
    },
  ]
}

/**
 * Chunk any embedded collection's document.
 *
 * @param collection - Collection slug.
 * @param doc - The document.
 * @returns Ordered chunks for that document.
 */
export function chunkDocument(
  collection: CorvusCollectionSlug,
  doc: SourceDoc,
): CorvusChunk[] {
  return collection === 'posts'
    ? chunkPost(doc)
    : chunkFlatRecord(collection, doc)
}

/**
 * Is this document eligible to be in the index at all?
 *
 * @remarks Posts are drafts-enabled with autosave, so only a published
 * `_status` is embeddable — every autosave tick writes a draft version and
 * must cost zero provider dollars. The four flat collections have no drafts,
 * so they are always eligible.
 *
 * Future-dated posts ARE embedded, and excluded at QUERY time by retrieval's
 * `published_at <= now()` predicate rather than here. That is deliberate and
 * is the only correct place for it: nothing fires a hook when a clock passes a
 * timestamp, so a write-time skip would leave a scheduled post missing from
 * the index indefinitely after its publication date arrived. Filtering in SQL
 * makes it appear the moment it is due, with no re-embed and no cron.
 *
 * @param collection - Collection slug.
 * @param doc - The document.
 * @returns `true` when the document's chunks belong in `corvus_embeddings`.
 */
export function isEmbeddable(
  collection: CorvusCollectionSlug,
  doc: SourceDoc,
): boolean {
  if (collection !== 'posts') return true
  return doc._status === 'published'
}
