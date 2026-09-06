import { createHash } from 'node:crypto'

import { publicPathFor, type PathableDoc } from '@/fields/slug/slugPaths'
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
 * The non-CMS collection holding one document per public GitHub repo (#147).
 *
 * @remarks Deliberately NOT a member of {@link CORVUS_EMBEDDED_COLLECTIONS}.
 * That constant is documented as "the single source of truth for which
 * collections carry a refresh hook", and this collection has no Payload
 * document and therefore no hook to carry — it is written by a scheduled
 * script (`scripts/sync-github-repos.ts`), which is the whole point of #147:
 * repo facts enter the index at sync time, never at answer time. Adding it to
 * that list would wire a hook onto a collection Payload knows nothing about.
 *
 * `corvus_embeddings.collection` is a plain `text` column (#82 decision D3c
 * anticipated exactly this), so nothing about a new collection needs a
 * migration.
 */
export const CORVUS_GITHUB_REPOS_COLLECTION = 'github-repos'

/**
 * The section every role's Page lives under, and therefore the prefix a
 * `work-history` citation composes against (#137).
 *
 * @remarks Not derived from `SLUG_ROUTED_COLLECTIONS`: `/work` is a hierarchy
 * *Page* (`path: 'work'`), not a collection prefix, so there is nothing in the
 * routing map to read it from. Named here so the one place that knows it is
 * the one place that builds the citation.
 */
const WORK_SECTION_PREFIX = '/work'

/**
 * Every value that may appear in `corvus_embeddings.collection`.
 *
 * @remarks Wider than {@link CorvusCollectionSlug} on purpose. The CMS-facing
 * functions in this module — `chunkDocument`, `isEmbeddable`, and the hook
 * wiring that calls them — keep the narrow type, because handing them a
 * `github-repos` "document" is meaningless. What has to widen is the shape of
 * a ROW: `CorvusChunk` describes what gets written, and `github-repos` rows are
 * written by `src/lib/ai/githubReposSync.ts` through the same store primitives.
 */
export type CorvusChunkCollection =
  CorvusCollectionSlug | typeof CORVUS_GITHUB_REPOS_COLLECTION

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
  collection: CorvusChunkCollection
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
 * ## The one absolute URL (#147)
 *
 * `github-repos` is the exception, and it is an exception by nature rather
 * than by convenience: a repo's canonical address is on github.com, and this
 * site has no page that documents an individual repository. So the citation
 * this collection produces is `https://github.com/<owner>/<repo>` — the only
 * `sourceUrl` in the index that is not site-relative.
 *
 * Three downstream consequences, all deliberate and all already handled:
 *
 * - `buildGroundedSystem` renders it under the same `Source:` label, so it is
 *   a citation Corvus is permitted to write. Its extra `github-repos`
 *   paragraph is what stops the model reading the existing "the site's own
 *   page is the citation" sentence as a ban on citing the repo.
 * - `isInternalCorvusLink` (#144) answers `false` for it, so a visitor
 *   clicking it gets streamdown's external-link confirmation. That is correct:
 *   the link really does leave the site.
 * - The eval scorers' `citedPaths` ignores non-site absolute URLs entirely, so
 *   a repo citation is invisible to `cites-a-real-source-url` and needs its
 *   own scorer rather than a widened one. See `evals/scorers.ts`.
 *
 * ## What the second argument is (#153)
 *
 * A **document**, for `posts` — because a placed post's citation is its section
 * URL and a slug alone cannot name `/work/brytecore`. That is the same
 * narrowing `canonicalizeArticleUrl` took in this change, and the two seams
 * agree on purpose: a bare slug for a post is now a lie the type system can see.
 * A bare string is still accepted and read as a slug, because `github-repos`
 * genuinely has no document here — its identity is the `owner/name` string the
 * GitHub sync holds — and the four flat collections pass nothing at all.
 *
 * @param collection - Collection slug.
 * @param ref - For `posts`, the document (or any projection carrying `slug` and,
 * when placed, `path`); a bare slug string is accepted and read as unplaced. For
 * `work-history`, the document or slug naming the role's Page under `/work`
 * (#137) — a row without one still cites `/`. For `github-repos`, the repo's
 * `owner/name` full name. Unused by the remaining three flat collections, which
 * cite the single index page that renders them.
 * @returns A URL for the chunk to cite, or `null` when none applies.
 */
export function sourceUrlFor(
  collection: CorvusChunkCollection,
  ref?: string | PathableDoc | null,
): string | null {
  const doc: PathableDoc = typeof ref === 'string' ? { slug: ref } : (ref ?? {})
  switch (collection) {
    case 'posts':
      // Through the one path seam (#153): a PLACED post is cited at its section
      // URL, an unplaced one at `/articles/<slug>` exactly as before. Chunks
      // carry `sourceUrl` at write time, so a placement change has to reach the
      // stored rows — and it does NOT do so by re-embedding. A placement moves
      // `parent` and nothing else, so every chunk hash still matches and
      // `isContentUnchanged` short-circuits before the provider is ever called.
      // The refresh instead lands through `hasMetadataDrift`, which watches
      // `source_url` alongside `visibility` and `published_at` and repairs it
      // with a metadata-only UPDATE — no vectors, no tokens, no touched content
      // hash. See `src/lib/ai/embeddingsStore.ts`.
      return publicPathFor('posts', doc)
    case 'projects':
      return '/projects'
    case 'uses':
      return '/uses'
    case 'tech-stack':
      return '/tech'
    case 'work-history': {
      // #137: a role's public home is its Page under the `/work` section, and
      // `work-history` rows carry a slug precisely so this citation can be
      // composed without a route of their own. Composed here rather than
      // through `publicPathFor` on purpose: `work-history` is deliberately NOT
      // in `SLUG_ROUTED_COLLECTIONS` (nothing routes on its slug, and putting
      // it there would extend the #120 slug freeze to a collection with no URL
      // to protect), so this is the one place that knows the `/work` prefix.
      //
      // The fallback to `/` is the pre-#137 behaviour and is deliberately
      // kept: a row seeded before the slug field existed has no slug, and a
      // citation of `/work/` — a URL that 404s — would be strictly worse than
      // the homepage it used to cite.
      const slug = typeof doc.slug === 'string' ? doc.slug.trim() : ''
      return slug ? `${WORK_SECTION_PREFIX}/${slug}` : '/'
    }
    case CORVUS_GITHUB_REPOS_COLLECTION: {
      const fullName = typeof ref === 'string' ? ref.trim() : ''
      // `owner/name`, both segments present. A half-formed value would
      // otherwise produce `https://github.com/brandonperfetti` — a real page
      // that is not this repo, which is a worse citation than none at all.
      return /^[\w.-]+\/[\w.-]+$/.test(fullName)
        ? `https://github.com/${fullName}`
        : null
    }
  }
}

/** Minimal structural view of a document; the chunkers never need Payload types. */
type SourceDoc = Record<string, unknown>

const str = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

/**
 * Render one `"Field: value"` line, or `null` when there is no value.
 *
 * @remarks Coerces finite numbers because `str()` returns `''` for anything
 * non-string, and several labelled fields are numeric — `projects.year` is
 * `type: 'number'`, so `Year: 2026` never reached the embedded text and
 * "when was that project built" had no grounding even though the data was
 * right there. `NaN` and `Infinity` are deliberately still dropped: they are
 * corrupt data, not facts worth embedding.
 *
 * Booleans are deliberately NOT coerced. No call site labels a boolean today
 * (`work-history.current` is the only boolean any chunker reads, and it picks
 * the word `'Present'` rather than emitting `true`), and a bare
 * `"Featured: true"` is worse grounding text than a purpose-written phrase.
 * A boolean field that earns a place in a chunk should get real wording at
 * its call site, which is a decision this helper should not silently make.
 *
 * @param name - Field label.
 * @param value - Raw field value.
 * @returns The rendered line, or `null` when the value is empty.
 */
const label = (name: string, value: unknown): string | null => {
  const text =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : str(value)
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
  // The document, not its slug: a placed post cites its section URL (#153).
  const sourceUrl = sourceUrlFor('posts', doc)

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
 * The values `tech_stack.proficiency` may hold.
 *
 * @remarks Mirrors the `options` on `src/collections/TechStack.ts`. Written
 * out rather than derived from that config for the reason the label map below
 * gives — importing the collection would drag Payload's field types into a
 * module the eval fixtures load — and pinned against it by test, so the two
 * cannot disagree.
 */
export type TechProficiency = 'daily' | 'proficient' | 'familiar' | 'exploring'

/**
 * `tech_stack.proficiency`'s stored values, mapped to their admin labels.
 *
 * @remarks A copy of the `options` on `src/collections/TechStack.ts`, and
 * deliberately a copy rather than an import: that module pulls in Payload's
 * field types, and `chunking.ts` is imported by the eval fixture retriever
 * and by `scorers.test.ts`, neither of which should drag a CMS config in.
 * `chunking.test.ts` pins the pair against each other, so the copy cannot
 * drift silently.
 *
 * The label is what gets embedded (#165). The stored value is an enum —
 * `Proficiency: daily` — and "daily" in isolation reads as a frequency, not a
 * ranking, so a question phrased "what do you use most" had nothing in the
 * passage to match on. `Proficiency: Daily driver` says the thing the field
 * means, in the words a visitor would use.
 *
 * Keyed by {@link TechProficiency} rather than by `string`, so a typo cannot
 * silently produce a map with no `daily` key — which would disable the lead
 * sentence and the ranking signal with it, and would do so without failing
 * anything but a keyed eval run.
 */
export const TECH_PROFICIENCY_LABELS: Record<TechProficiency, string> = {
  daily: 'Daily driver',
  proficient: 'Proficient',
  familiar: 'Familiar',
  exploring: 'Exploring',
}

/**
 * The stored `proficiency` value that marks Brandon's everyday stack.
 *
 * @remarks Named because three things key on it: the lead sentence below, the
 * ranking rule in `groundedSystem.ts`, and the docs. Ten rows carry it on the
 * production database — TypeScript, Node.js, React, Next.js, GraphQL,
 * Tailwind CSS, Clerk, Supabase, Vercel and AI SDK — measured 2026-09-04
 * (#165).
 */
export const DAILY_DRIVER_PROFICIENCY: TechProficiency = 'daily'

/**
 * The human label for a stored proficiency value.
 *
 * @param proficiency - The stored enum value, possibly empty.
 * @returns The admin label, or the raw value when it is not one we know
 * (a value added to the collection before this map catches up embeds as
 * itself rather than disappearing from the chunk).
 */
export function techProficiencyLabel(proficiency: string): string {
  // Widened to `string` at the boundary on purpose: `doc.proficiency` arrives
  // from a Payload document as unknown data, so the lookup has to tolerate a
  // value the union does not name. The `??` below is what handles that, and
  // the return type says an unknown value passes through rather than
  // disappearing from the chunk.
  return (
    (TECH_PROFICIENCY_LABELS as Record<string, string | undefined>)[
      proficiency
    ] ?? proficiency
  )
}

/**
 * The sentence that opens a daily-driver technology's chunk (#165).
 *
 * @remarks The measured defect: asked "What tech do you use?" on production
 * (2026-09-04) Corvus answered TypeScript, TanStack, Vite, Vercel and Expo —
 * Next.js and React, the stack behind most of Brandon's repositories, absent.
 * Retrieval is pure vector similarity, so the answer was whichever `tech-stack`
 * rows happened to embed nearest the phrasing, and a bare `Proficiency: daily`
 * line gave the ranking signal almost no surface to be found by.
 *
 * A sentence, not another label, and FIRST in the chunk: labelled fields embed
 * as a list of attributes, while prose about what Brandon reaches for most days
 * is the shape a "what do you use?" question actually resembles.
 *
 * Its VOCABULARY is constrained, and measurably so. The eval tier scores by
 * query-term coverage rather than cosine distance (`fixtures/retriever.ts`),
 * so a word in this sentence is a word every daily-driver chunk now matches
 * on. A first draft carrying "stack", "technologies" and "works" lifted all
 * six daily fixture rows over the Vitest and PostgreSQL rows for
 * "which testing tool appears in the tech stack" and
 * "what proficiency does the tech stack give PostgreSQL", breaking four
 * retrieval preconditions in `evals/scorers.test.ts` `[measured, 2026-09-04]`.
 * The wording below deliberately avoids the vocabulary those questions share
 * with the labels. That is an artefact of the stand-in retriever, not of
 * production embeddings — but the preconditions it protects are what keep a
 * keyed eval run measuring Corvus rather than measuring a fixture.
 *
 * Note this changes chunk TEXT, so it changes `contentHash` — the four rows
 * this affects re-embed on their next save, and
 * `scripts/backfill-corvus-embeddings.ts` is what applies it to the whole
 * corpus at once. Until one of those runs, stored rows keep the old wording;
 * the prompt rule ships independently and does not wait for them.
 *
 * @param proficiency - The stored proficiency value.
 * @param name - The technology's name, so the sentence names it.
 * @returns The lead sentence, or `null` for every other proficiency.
 */
export function dailyDriverLead(
  proficiency: string,
  name: string,
): string | null {
  if (proficiency !== DAILY_DRIVER_PROFICIENCY) return null
  const subject = name || 'This'
  return `${subject} is one of Brandon Perfetti's daily drivers — he reaches for it most days, rather than having only tried it.`
}

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
    case 'tech-stack': {
      title = str(doc.name) || null
      const proficiency = str(doc.proficiency)
      lines = [
        dailyDriverLead(proficiency, str(doc.name)),
        label('Technology', doc.name),
        label('Category', doc.category),
        label('Proficiency', techProficiencyLabel(proficiency)),
        label('URL', doc.url),
        label('Notes', doc.notes),
      ]
      break
    }
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
      // The document, not nothing: `work-history` composes `/work/<slug>` from
      // it (#137). The other three flat collections cite a fixed index page
      // and ignore the argument entirely, so passing it is free.
      sourceUrl: sourceUrlFor(collection, {
        slug: typeof doc.slug === 'string' ? doc.slug : undefined,
      }),
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
